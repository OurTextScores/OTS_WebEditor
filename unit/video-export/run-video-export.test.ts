import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';

const sinks = vi.hoisted(() => ({ create: vi.fn(), probe: vi.fn() }));
vi.mock('../../lib/video-export/mediabunnySink', () => ({
  createMediabunnySink: sinks.create,
  probeEncoders: sinks.probe,
}));
vi.mock('../../lib/video-export/pageRaster', () => ({
  createPageProvider: () => ({
    ensure: async () => {},
    prefetch: () => {},
    release: () => {},
    get: () => ({ bitmap: { width: 1, height: 1 }, shapes: [] }),
  }),
}));
vi.mock('../../lib/video-export/compositor', () => ({
  createCompositor: () => ({ draw: () => {} }),
}));

import { ExportCancelled } from '../../lib/video-export/exportVideo';
import { DEFAULT_OPTIONS } from '../../lib/video-export/options';
import { ExportUnavailable, runVideoExport } from '../../lib/video-export/runVideoExport';

const measures = {
  elements: [{ id: 0, page: 0, x: 0, y: 0, sx: 10, sy: 10, width: 10, height: 10 }],
  events: [],
  pageSize: { width: 100, height: 100 },
};
const score = {
  measurePositions: async () => measures,
  playbackTimeline: async () => ({
    schemaVersion: 1,
    durationMs: 100,
    renderDurationMs: 100,
    occurrences: [{ occurrenceIndex: 0, measureIndex: 0, startMs: 0, endMs: 100 }],
  }),
  saveSvg: async () => '<svg/>',
} as unknown as Score;
const silent = { ...DEFAULT_OPTIONS, audio: false };

const sinkThatWorks = () => ({
  addFrame: vi.fn(async () => {}),
  addAudio: vi.fn(async () => {}),
  finish: vi.fn(async () => new Blob(['ok'])),
  cancel: vi.fn(async () => {}),
});
const sinkThatFails = (error: Error) => ({
  ...sinkThatWorks(),
  addFrame: vi.fn(async () => {
    throw error;
  }),
});

beforeEach(() => {
  sinks.create.mockReset();
  sinks.probe.mockReset().mockResolvedValue({ video: ['avc', 'vp9'], audio: ['aac', 'opus'] });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {};
      }
    },
  );
});

describe('runVideoExport fallback', () => {
  it('uses MP4 when it works, without a fallback note', async () => {
    sinks.create.mockResolvedValue(sinkThatWorks());
    const result = await runVideoExport({ score, options: silent });
    expect(result.format.container).toBe('mp4');
    expect(result.fallback).toBeUndefined();
    expect(sinks.create).toHaveBeenCalledTimes(1);
  });

  it('retries as WebM when the MP4 attempt fails, and says why', async () => {
    sinks.create
      .mockResolvedValueOnce(
        sinkThatFails(
          new Error(
            'The video encoder failed (MP4, avc + aac): Encoding error. (Unexpected frame format.)',
          ),
        ),
      )
      .mockResolvedValueOnce(sinkThatWorks());
    const result = await runVideoExport({ score, options: silent });
    expect(result.format).toMatchObject({ container: 'webm', video: 'vp9' });
    expect(result.fallback).toEqual({
      from: 'mp4',
      reason: expect.stringContaining('Unexpected frame format'),
    });
    expect(sinks.create.mock.calls[1][0].format.container).toBe('webm');
  });

  it('gives up with the original error when WebM fails too', async () => {
    sinks.create.mockResolvedValue(sinkThatFails(new Error('boom')));
    await expect(runVideoExport({ score, options: silent })).rejects.toThrow('boom');
    expect(sinks.create).toHaveBeenCalledTimes(2);
  });

  it('does not retry a cancelled export', async () => {
    sinks.create.mockResolvedValue(sinkThatFails(new ExportCancelled()));
    await expect(runVideoExport({ score, options: silent })).rejects.toBeInstanceOf(
      ExportCancelled,
    );
    expect(sinks.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry when streaming to a file: the stream is spent and the name says MP4', async () => {
    sinks.create.mockResolvedValue(sinkThatFails(new Error('boom')));
    await expect(
      runVideoExport({ score, options: silent, writable: {} as WritableStream }),
    ).rejects.toThrow('boom');
    expect(sinks.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry a WebM export, and has nothing to fall back to without VP9/AV1', async () => {
    sinks.probe.mockResolvedValue({ video: ['vp9'], audio: ['opus'] });
    sinks.create.mockResolvedValue(sinkThatFails(new Error('boom')));
    await expect(runVideoExport({ score, options: silent })).rejects.toThrow('boom');
    expect(sinks.create).toHaveBeenCalledTimes(1);

    sinks.create.mockClear();
    sinks.probe.mockResolvedValue({ video: ['avc'], audio: ['aac'] });
    await expect(runVideoExport({ score, options: silent })).rejects.toThrow('boom');
    expect(sinks.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry a score that cannot be exported at all (nothing to play)', async () => {
    const reads = vi.fn(async () => measures);
    const empty = {
      ...score,
      measurePositions: reads,
      playbackTimeline: async () => ({
        schemaVersion: 1,
        durationMs: 0,
        renderDurationMs: 0,
        occurrences: [],
      }),
    } as unknown as Score;
    await expect(runVideoExport({ score: empty, options: silent })).rejects.toBeInstanceOf(
      ExportUnavailable,
    );
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('reports a missing encoder as unavailable, not as a failure to retry', async () => {
    sinks.probe.mockResolvedValue({ video: [], audio: [] });
    await expect(runVideoExport({ score, options: silent })).rejects.toBeInstanceOf(
      ExportUnavailable,
    );
    expect(sinks.create).not.toHaveBeenCalled();
  });
});
