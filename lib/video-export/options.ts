import type { VideoHighlight } from './framePlan';
import type { VideoLayout } from './layout';

export interface VideoExportOptions {
  readonly layout: VideoLayout;
  readonly fps: 30 | 60;
  readonly highlight: VideoHighlight;
  /** Include the rendered audio. Off gives a silent video. */
  readonly audio: boolean;
  /** Draw the moving playback cursor (the editor/player follow map). Off by default: an intentional choice. */
  readonly cursor: boolean;
}

export const DEFAULT_OPTIONS: VideoExportOptions = {
  layout: 'landscape',
  fps: 30,
  highlight: 'measure',
  audio: true,
  cursor: false,
};

/** Frame size in pixels. Even, because H.264 cannot encode odd dimensions. */
export function frameSize(layout: VideoLayout): { width: number; height: number } {
  return layout === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

/** Sheet music is mostly static: about 2 Mbps at 1080p30, scaled with the frame rate (but not linearly). */
export function videoBitrate(fps: number): number {
  return fps >= 60 ? 3_000_000 : 2_000_000;
}

export const AUDIO_BITRATE = 128_000;

/** Rough output size in bytes, for the dialog: what the encoders are asked for, over the duration. */
export function estimateBytes(durationMs: number, options: VideoExportOptions): number {
  const bits = videoBitrate(options.fps) + (options.audio ? AUDIO_BITRATE : 0);
  return Math.round((durationMs / 1000) * (bits / 8));
}

/** A safe download name from the score's title. */
export function fileNameFor(title: string | null | undefined, extension: string): string {
  const base = (title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'score'}.${extension}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
