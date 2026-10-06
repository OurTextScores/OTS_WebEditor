import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../lib/video-export/options';
import type { Score } from '../../lib/webmscore-loader';

const run = vi.hoisted(() => vi.fn());
vi.mock('../../lib/video-export/runVideoExport', () => ({
  runVideoExport: run,
  previewFormat: vi.fn(),
  ExportUnavailable: class ExportUnavailable extends Error {},
}));

import { useVideoExport } from '../../components/score-player/useVideoExport';

const score = { metadata: vi.fn(async () => ({ title: 'My Piece' })) } as unknown as Score;
const format = {
  ok: true,
  container: 'webm',
  video: 'vp9',
  audio: 'opus',
  extension: 'webm',
  mimeType: 'video/webm',
};

function fakeWritable() {
  return { abort: vi.fn(async () => {}), close: vi.fn(async () => {}) };
}
function fakeHandle(size = 1234) {
  const writable = fakeWritable();
  return {
    writable,
    handle: {
      name: 'My Piece.webm',
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => ({ size })),
    },
  };
}

beforeEach(() => {
  run.mockReset();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('useVideoExport', () => {
  it('downloads the blob when not writing to disk', async () => {
    run.mockResolvedValue({ blob: new Blob(['abc']), format });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { result } = renderHook(() => useVideoExport(score));
    await act(() => result.current.start(DEFAULT_OPTIONS));
    expect(result.current.state).toEqual({ status: 'done', fileName: 'My Piece.webm', bytes: 3 });
    expect(click).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].writable).toBeUndefined();
  });

  it('asks for a file first, writes the export into it, and reports its size', async () => {
    const { handle, writable } = fakeHandle(9_999);
    const picker = vi.fn(async () => handle);
    vi.stubGlobal('showSaveFilePicker', picker);
    run.mockResolvedValue({ blob: null, format });
    const { result } = renderHook(() => useVideoExport(score));
    await act(() =>
      result.current.start(DEFAULT_OPTIONS, { extension: 'webm', mimeType: 'video/webm' }),
    );
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'My Piece.webm' }),
    );
    expect(run.mock.calls[0][0].writable).toBe(writable);
    expect(result.current.state).toEqual({
      status: 'done',
      fileName: 'My Piece.webm',
      bytes: 9_999,
    });
  });

  it('goes quietly back to idle when the picker is dismissed, and never starts the export', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => {
        throw new DOMException('no', 'AbortError');
      }),
    );
    const { result } = renderHook(() => useVideoExport(score));
    await act(() =>
      result.current.start(DEFAULT_OPTIONS, { extension: 'webm', mimeType: 'video/webm' }),
    );
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(run).not.toHaveBeenCalled();
  });

  it('discards the half-written file when the export fails', async () => {
    const { handle, writable } = fakeHandle();
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(async () => handle),
    );
    run.mockRejectedValue(new Error('encoder died'));
    const { result } = renderHook(() => useVideoExport(score));
    await act(() =>
      result.current.start(DEFAULT_OPTIONS, { extension: 'webm', mimeType: 'video/webm' }),
    );
    expect(writable.abort).toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'error' }));
  });

  it('does not start a second export while one runs', async () => {
    let finish!: (value: unknown) => void;
    run.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useVideoExport(score));
    act(() => {
      void result.current.start(DEFAULT_OPTIONS);
    });
    await act(() => result.current.start(DEFAULT_OPTIONS));
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ blob: new Blob(['x']), format });
    });
  });
});
