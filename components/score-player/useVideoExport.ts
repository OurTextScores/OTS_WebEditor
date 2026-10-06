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
import {
  getSaveFilePicker,
  isPickerDismissed,
  type SaveFileHandle,
} from '@/lib/video-export/saveTarget';

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
    async (options: VideoExportOptions, toDisk?: { extension: string; mimeType: string }) => {
      if (!score || controller.current) return;
      const abort = new AbortController();
      controller.current = abort;
      let handle: SaveFileHandle | null = null;
      let writable: FileSystemWritableFileStream | undefined;
      try {
        const meta = await score.metadata().catch(() => ({}) as Record<string, unknown>);
        const title = typeof meta.title === 'string' ? meta.title : null;
        if (toDisk) {
          // Asked first, while the click still counts as a user gesture; the file is then written as the export goes.
          handle = await getSaveFilePicker()!({
            suggestedName: fileNameFor(title, toDisk.extension),
            types: [
              { description: 'Video', accept: { [toDisk.mimeType]: [`.${toDisk.extension}`] } },
            ],
          });
          writable = await handle.createWritable();
        }
        setState({ status: 'running', framesDone: 0, frameCount: 1 });
        const { blob, format } = await runVideoExport({
          score,
          options,
          writable,
          signal: abort.signal,
          onProgress: ({ framesDone, frameCount }) =>
            setState({ status: 'running', framesDone, frameCount }),
          ensureSoundFont: async () => {
            await soundFonts.ensure(score);
          },
        });
        if (handle && writable) {
          setState({ status: 'done', fileName: handle.name, bytes: (await handle.getFile()).size });
          return;
        }
        if (!blob) throw new Error('The export produced no file.');
        const fileName = fileNameFor(title, format.extension);
        download(blob, fileName);
        setState({ status: 'done', fileName, bytes: blob.size });
      } catch (error) {
        // A half-written file is discarded, not left behind.
        await writable?.abort().catch(() => undefined);
        if (isPickerDismissed(error) || error instanceof ExportCancelled || abort.signal.aborted) {
          setState({ status: 'idle' });
        } else {
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
