import type { Score } from '../webmscore-loader';
import { timelineFromPositions } from '../playback/timeline';
import { audioBlocks } from './audioFeed';
import { chooseFormat, maxInMemorySeconds, type ExportFormat } from './capabilities';
import { createCompositor } from './compositor';
import { ExportCancelled, exportVideo, type ExportProgress } from './exportVideo';
import { buildFramePlan } from './framePlan';
import { buildFollowMapIndex } from '../playback/score-following';
import { AUDIO_BITRATE, frameSize, videoBitrate, type VideoExportOptions } from './options';
import { createPageProvider } from './pageRaster';
import { createMediabunnySink, probeEncoders } from './mediabunnySink';

export class ExportUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportUnavailable';
  }
}

export interface RunVideoExportInput {
  readonly score: Score;
  readonly options: VideoExportOptions;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
  /** Makes sure the soundfont is loaded into the score, before the audio is rendered. */
  readonly ensureSoundFont?: () => Promise<void>;
  /** Stream the file here instead of holding it in memory (a `FileSystemWritableFileStream`). */
  readonly writable?: WritableStream;
}

export interface VideoExportResult {
  /** The file, or null when it was streamed to `writable`. */
  readonly blob: Blob | null;
  readonly format: Extract<ExportFormat, { ok: true }>;
  /** Set when the first (MP4) attempt failed and this file is the WebM retry. */
  readonly fallback?: FallbackNote;
}

/** What this browser will produce, for the dialog to show before anything starts. */
export async function previewFormat(options: VideoExportOptions): Promise<ExportFormat> {
  return chooseFormat(await probeEncoders(frameSize(options.layout)), options.audio);
}

/** What the MP4 attempts died of, when the export went on as WebM instead. */
export interface FallbackNote {
  readonly from: 'mp4';
  readonly reason: string;
}

type Attempt = {
  readonly format: Extract<ExportFormat, { ok: true }>;
  readonly frames?: 'i420';
  readonly hardwareAcceleration?: 'prefer-software';
};

/** The attempt that last worked in this page, so a browser that needed the fallback is not asked to fail again. */
let lastWorking = 0;

/** Forgets which attempt worked (for tests). */
export const forgetWorkingEncoder = () => {
  lastWorking = 0;
};

/**
 * Exports `score` as a video: reads its positions and timeline, then drives `exportVideo` with the real page rasteriser,
 * canvas and encoders. Runs on the main thread; it yields between frames, so the page stays usable.
 *
 * MP4 (H.264 + AAC) leans on the platform's own encoders, some of which reject frames the others accept (a Windows
 * H.264 encoder answers "Unexpected frame format" to canvas-backed frames). So a failed attempt (anything but a cancel)
 * is followed by MP4 with plain I420 frames, then with I420 frames and the software encoder, then by WebM (VP9 + Opus,
 * software everywhere); the result says when it ended up WebM and why. Not retried when writing to a chosen file: that stream is spent by the failed attempt and its
 * name already says MP4.
 */
export async function runVideoExport(input: RunVideoExportInput): Promise<VideoExportResult> {
  const { score, options } = input;
  const withAudio = options.audio && typeof score.synthAudioBatch === 'function';
  const support = await probeEncoders(frameSize(options.layout));
  const format = chooseFormat(support, withAudio);
  if (!format.ok) throw new ExportUnavailable(format.reason);

  const attempts: Attempt[] = [{ format }];
  if (format.container === 'mp4' && !input.writable) {
    // Frames the encoder cannot read are the usual cause (a canvas-backed frame some Windows encoders refuse), so the
    // next tries give it plain I420 pixels, with the default encoder and then the software one.
    attempts.push(
      { format, frames: 'i420' },
      { format, frames: 'i420', hardwareAcceleration: 'prefer-software' },
    );
    const webm = chooseFormat(
      {
        video: support.video.filter((codec) => codec !== 'avc'),
        audio: support.audio.filter((codec) => codec !== 'aac'),
      },
      withAudio,
    );
    if (webm.ok) attempts.push({ format: webm });
  }

  let firstError: unknown;
  for (
    let index = Math.min(lastWorking, attempts.length - 1);
    index < attempts.length;
    index += 1
  ) {
    try {
      const result = await exportWithFormat(input, attempts[index]);
      lastWorking = index;
      const droppedMp4 =
        attempts[index].format.container === 'webm' && attempts[0].format.container === 'mp4';
      return droppedMp4 && firstError !== undefined
        ? { ...result, fallback: { from: 'mp4', reason: errorText(firstError) } }
        : result;
    } catch (error) {
      if (
        input.signal?.aborted ||
        error instanceof ExportCancelled ||
        error instanceof ExportUnavailable
      )
        throw error;
      firstError ??= error;
      if (index === attempts.length - 1) throw firstError;
    }
  }
  throw firstError;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function exportWithFormat(
  input: RunVideoExportInput,
  { format, frames, hardwareAcceleration }: Attempt,
): Promise<VideoExportResult> {
  const { score, options, signal } = input;
  const frame = frameSize(options.layout);
  const measures = await score.measurePositions();
  const native = score.playbackTimeline
    ? await Promise.resolve(score.playbackTimeline()).catch(() => null)
    : null;
  const timeline = native ?? timelineFromPositions(measures);
  if (timeline.occurrences.length === 0)
    throw new ExportUnavailable('This score has nothing to play.');

  const hasAudio = options.audio && typeof score.synthAudioBatch === 'function';
  const bitrate = videoBitrate(options.fps);
  if (!input.writable) {
    const limit = maxInMemorySeconds(bitrate, hasAudio ? AUDIO_BITRATE : 0);
    if (timeline.durationMs / 1000 > limit) {
      throw new ExportUnavailable(
        `This score is ${Math.round(timeline.durationMs / 60_000)} minutes long; exporting more than ${Math.floor(limit / 60)} minutes needs a browser that can save straight to disk (Chrome or Edge).`,
      );
    }
  }

  const segments =
    options.highlight === 'note' ? await score.segmentPositions().catch(() => null) : null;
  const followMap = options.cursor
    ? buildFollowMapIndex(
        await Promise.resolve(score.playbackFollowMap?.() ?? null).catch(() => null),
      )
    : null;
  const plan = buildFramePlan({
    timeline,
    measures,
    segments,
    followMap,
    highlight: segments ? 'note' : 'measure',
    layout: options.layout,
    frame,
    fps: options.fps,
    // The engine renders the ring-out past the last note; the picture holds through it so the sound is not cut or orphaned.
    tailMs: hasAudio ? Math.max(0, (timeline.renderDurationMs ?? 0) - timeline.durationMs) : 0,
  });

  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d', frames === 'i420' ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new ExportUnavailable('This browser cannot draw video frames.');
  const pages = createPageProvider((page) => score.saveSvg(page, true, false), plan.geometry);
  const compositor = createCompositor(ctx, frame, plan.geometry, (page) => pages.get(page));

  if (hasAudio) await input.ensureSoundFont?.();
  const iterator = hasAudio ? await score.synthAudioBatch!(0, 2) : null;
  const sink = await createMediabunnySink({
    canvas,
    format,
    videoBitsPerSecond: bitrate,
    audioBitsPerSecond: AUDIO_BITRATE,
    hasAudio: iterator !== null,
    frames,
    hardwareAcceleration,
    writable: input.writable,
  });

  const blob = await exportVideo({
    plan,
    compositor,
    pages,
    sink,
    audio: iterator ? audioBlocks(iterator, signal) : undefined,
    signal,
    onProgress: input.onProgress,
  });
  pages.release([]);
  return { blob, format };
}
