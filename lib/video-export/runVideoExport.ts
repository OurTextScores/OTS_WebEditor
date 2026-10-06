import type { Score } from '../webmscore-loader';
import { timelineFromPositions } from '../playback/timeline';
import { audioBlocks } from './audioFeed';
import { chooseFormat, maxInMemorySeconds, type ExportFormat } from './capabilities';
import { createCompositor } from './compositor';
import { exportVideo, type ExportProgress } from './exportVideo';
import { buildFramePlan } from './framePlan';
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
}

/** What this browser will produce, for the dialog to show before anything starts. */
export async function previewFormat(options: VideoExportOptions): Promise<ExportFormat> {
  return chooseFormat(await probeEncoders(frameSize(options.layout)));
}

/**
 * Exports `score` as a video: reads its positions and timeline, then drives `exportVideo` with the real page rasteriser,
 * canvas and encoders. Runs on the main thread; it yields between frames, so the page stays usable.
 */
export async function runVideoExport(input: RunVideoExportInput): Promise<VideoExportResult> {
  const { score, options, signal } = input;
  const frame = frameSize(options.layout);
  const format = chooseFormat(await probeEncoders(frame));
  if (!format.ok) throw new ExportUnavailable(format.reason);

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
  const plan = buildFramePlan({
    timeline,
    measures,
    segments,
    highlight: segments ? 'note' : 'measure',
    layout: options.layout,
    frame,
    fps: options.fps,
    // The engine renders the ring-out past the last note; the picture holds through it so the sound is not cut or orphaned.
    tailMs: hasAudio ? Math.max(0, (timeline.renderDurationMs ?? 0) - timeline.durationMs) : 0,
  });

  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
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
