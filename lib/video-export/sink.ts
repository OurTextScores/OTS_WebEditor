import type { AudioBlock } from './audioFeed';

/**
 * Where the finished frames and audio go: the encoders and the container writer, behind a small seam so the export's
 * orchestration can be tested without WebCodecs. The video track reads the canvas the sink was built around.
 */
export interface VideoSink {
  /**
   * Encodes the canvas as it is now, shown from `timestampSeconds` for `durationSeconds`. Resolves when it can take more.
   * `unchanged` says the canvas is exactly as the previous frame left it, so a sink that reads pixels back may reuse them.
   */
  addFrame(timestampSeconds: number, durationSeconds: number, unchanged?: boolean): Promise<void>;
  /** Encodes a block of audio; `offsetSeconds` is added to its score time (the lead-in). */
  addAudio(block: AudioBlock, offsetSeconds: number): Promise<void>;
  /** Ends the file. Resolves to the bytes, or null when the sink streamed them to a file as it went. */
  finish(): Promise<Blob | null>;
  /** Abandons the file and releases the encoders. */
  cancel(): Promise<void>;
}
