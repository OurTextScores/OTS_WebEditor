import type { SynthAudioBatchIterator } from '../webmscore-loader';

/** A block of synthesised audio: planar channels, and when it starts in the score (seconds). */
export interface AudioBlock {
  readonly channels: Float32Array[];
  readonly sampleRate: number;
  readonly startSeconds: number;
  readonly frames: number;
}

/** The engine writes 512 frames per channel in each chunk, planar, as float32. */
export const FRAMES_PER_CHUNK = 512;
const DEFAULT_SAMPLE_RATE = 44_100;

/**
 * The engine's synthesised audio as blocks, one at a time, so the encoder can take them as they come instead of the
 * whole piece sitting in memory (a long score is hundreds of megabytes of PCM). Stops at the engine's `done`, an empty
 * batch, or when `signal` aborts (the iterator is then asked to cancel).
 */
export async function* audioBlocks(
  iterator: SynthAudioBatchIterator,
  signal?: AbortSignal,
): AsyncGenerator<AudioBlock> {
  try {
    for (;;) {
      if (signal?.aborted) return;
      const batch = await iterator();
      if (!Array.isArray(batch) || batch.length === 0) return;
      let done = false;
      for (const item of batch) {
        if (!item) continue;
        if (item.done) done = true;
        const floats = new Float32Array(
          item.chunk.buffer,
          item.chunk.byteOffset,
          Math.floor(item.chunk.byteLength / 4),
        );
        const channelCount = Math.min(2, Math.floor(floats.length / FRAMES_PER_CHUNK));
        if (channelCount < 1) continue;
        const span = typeof item.endTime === 'number' ? item.endTime - item.startTime : 0;
        const sampleRate = span > 0 ? Math.round(FRAMES_PER_CHUNK / span) : DEFAULT_SAMPLE_RATE;
        yield {
          // Copied: the chunk's buffer belongs to the engine's next call.
          channels: Array.from({ length: channelCount }, (_, channel) =>
            Float32Array.from(
              floats.subarray(channel * FRAMES_PER_CHUNK, (channel + 1) * FRAMES_PER_CHUNK),
            ),
          ),
          sampleRate,
          startSeconds: Number.isFinite(item.startTime) ? item.startTime : 0,
          frames: FRAMES_PER_CHUNK,
        };
      }
      if (done) return;
    }
  } finally {
    // A consumer that stops early (cancel, an error) must stop the engine's render too.
    await iterator(true).catch(() => []);
  }
}
