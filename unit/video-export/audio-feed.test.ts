import { describe, expect, it, vi } from 'vitest';
import { FRAMES_PER_CHUNK, audioBlocks, snapSampleRate } from '../../lib/video-export/audioFeed';
import type { SynthAudioBatchChunk } from '../../lib/webmscore-loader';

const chunk = (
  startTime: number,
  left: number,
  right: number,
  extra: Partial<SynthAudioBatchChunk> = {},
) => {
  const floats = new Float32Array(FRAMES_PER_CHUNK * 2);
  floats.fill(left, 0, FRAMES_PER_CHUNK);
  floats.fill(right, FRAMES_PER_CHUNK);
  return {
    chunk: new Uint8Array(floats.buffer),
    startTime,
    endTime: startTime + FRAMES_PER_CHUNK / 44_100,
    ...extra,
  };
};

function iteratorOf(batches: SynthAudioBatchChunk[][]) {
  let index = 0;
  return vi.fn(async (cancel?: boolean) => (cancel ? [] : (batches[index++] ?? [])));
}

const collect = async (gen: AsyncGenerator<unknown>) => {
  const out = [];
  for await (const item of gen) out.push(item);
  return out as Awaited<
    ReturnType<typeof audioBlocks> extends AsyncGenerator<infer T> ? T : never
  >[];
};

describe('audioBlocks', () => {
  it('splits each chunk into planar channels and reads the sample rate from the chunk span', async () => {
    const blocks = await collect(audioBlocks(iteratorOf([[chunk(0, 0.25, -0.5)]])));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].channels).toHaveLength(2);
    expect(blocks[0].channels[0][0]).toBe(0.25);
    expect(blocks[0].channels[1][0]).toBe(-0.5);
    expect(blocks[0].sampleRate).toBe(44_100);
    expect(blocks[0].frames).toBe(FRAMES_PER_CHUNK);
  });

  it('keeps one sample rate for the whole stream although chunk timings jitter by a few Hz', async () => {
    const jittered = (start: number, hz: number) =>
      chunk(start, 1, 1, { endTime: start + FRAMES_PER_CHUNK / hz });
    const blocks = await collect(
      audioBlocks(iteratorOf([[jittered(0, 44_100), jittered(1, 44_102), jittered(2, 44_097)]])),
    );
    expect(blocks.map((b) => b.sampleRate)).toEqual([44_100, 44_100, 44_100]);
  });

  it('snaps to the nearest standard rate', () => {
    expect(snapSampleRate(44_102)).toBe(44_100);
    expect(snapSampleRate(47_950)).toBe(48_000);
    expect(snapSampleRate(21_990)).toBe(22_050);
  });

  it('keeps going across batches and stops at done', async () => {
    const it = iteratorOf([[chunk(0, 1, 1)], [chunk(1, 2, 2, { done: true })], [chunk(2, 3, 3)]]);
    const blocks = await collect(audioBlocks(it));
    expect(blocks.map((b) => b.startSeconds)).toEqual([0, 1]);
  });

  it('stops at an empty batch', async () => {
    expect(await collect(audioBlocks(iteratorOf([[chunk(0, 1, 1)], []])))).toHaveLength(1);
  });

  it('copies the samples, because the engine reuses its buffer', async () => {
    const first = chunk(0, 1, 1);
    const blocks = await collect(audioBlocks(iteratorOf([[first]])));
    new Float32Array(first.chunk.buffer).fill(9);
    expect(blocks[0].channels[0][0]).toBe(1);
  });

  it('asks the engine to cancel when the consumer stops early', async () => {
    const it = iteratorOf([[chunk(0, 1, 1)], [chunk(1, 1, 1)]]);
    const gen = audioBlocks(it);
    await gen.next();
    await gen.return(undefined);
    expect(it).toHaveBeenLastCalledWith(true);
  });

  it('stops without reading when already aborted', async () => {
    const it = iteratorOf([[chunk(0, 1, 1)]]);
    const controller = new AbortController();
    controller.abort();
    expect(await collect(audioBlocks(it, controller.signal))).toHaveLength(0);
    expect(it).toHaveBeenCalledWith(true);
  });

  it('treats a one-channel chunk as mono', async () => {
    const mono = { chunk: new Uint8Array(new Float32Array(FRAMES_PER_CHUNK).buffer), startTime: 0 };
    const blocks = await collect(audioBlocks(iteratorOf([[mono]])));
    expect(blocks[0].channels).toHaveLength(1);
    expect(blocks[0].sampleRate).toBe(44_100);
  });
});
