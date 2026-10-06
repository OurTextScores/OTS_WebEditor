import { useCallback, useEffect, useRef, useState } from 'react';
import { SoundFontManager } from '@/lib/playback/soundfont-manager';
import type { Score } from '@/lib/webmscore-loader';
import { ExportCancelled } from '@/lib/video-export/exportVideo';
import { fileNameFor, type VideoExportOptions } from '@/lib/video-export/options';
import {
  previewFormat,
  runVideoExport,
  ExportUnavailable,
} from '@/lib/video-export/runVideoExport';
import type { ExportFormat } from '@/lib/video-export/capabilities';

export type VideoExportState =
  | { status: 'idle' }
  | { status: 'running'; framesDone: number; frameCount: number }
  | { status: 'done'; fileName: string; bytes: number }
  | { status: 'error'; message: string };

const soundFonts = new SoundFontManager<Score>();

/** Saves `blob` through a temporary link. */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Runs a video export of `score` and downloads the result. One export at a time; `cancel` abandons it, and so does
 * leaving the page (the effect's cleanup aborts it).
 */
export function useVideoExport(score: Score | null) {
  const [state, setState] = useState<VideoExportState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (options: VideoExportOptions) => {
      if (!score || controller.current) return;
      const abort = new AbortController();
      controller.current = abort;
      setState({ status: 'running', framesDone: 0, frameCount: 1 });
      try {
        const { blob, format } = await runVideoExport({
          score,
          options,
          signal: abort.signal,
          onProgress: ({ framesDone, frameCount }) =>
            setState({ status: 'running', framesDone, frameCount }),
          ensureSoundFont: async () => {
            await soundFonts.ensure(score);
          },
        });
        if (!blob) throw new Error('The export produced no file.');
        const meta = await score.metadata().catch(() => ({}) as Record<string, unknown>);
        const fileName = fileNameFor(
          typeof meta.title === 'string' ? meta.title : null,
          format.extension,
        );
        download(blob, fileName);
        setState({ status: 'done', fileName, bytes: blob.size });
      } catch (error) {
        if (error instanceof ExportCancelled || abort.signal.aborted) setState({ status: 'idle' });
        else {
          setState({
            status: 'error',
            message:
              error instanceof ExportUnavailable
                ? error.message
                : `The export failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } finally {
        controller.current = null;
      }
    },
    [score],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(
    () => setState((s) => (s.status === 'running' ? s : { status: 'idle' })),
    [],
  );

  return { state, start, cancel, reset };
}

/** Which container and codecs this browser will use for `options`, once known (null while probing). */
export function useFormatPreview(
  options: VideoExportOptions,
  enabled: boolean,
): ExportFormat | null {
  const [format, setFormat] = useState<ExportFormat | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void previewFormat(options).then((value) => {
      if (current) setFormat(value);
    });
    return () => {
      current = false;
    };
  }, [enabled, options]);
  return format;
}
