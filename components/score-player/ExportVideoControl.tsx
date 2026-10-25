'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Film } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { readPlayerPreference } from '@/lib/playback/player-preferences';
import { formatPlaybackTime } from '@/lib/playback/timeline';
import type { Score } from '@/lib/webmscore-loader';
import {
  DEFAULT_OPTIONS,
  estimateBytes,
  formatBytes,
  type VideoExportOptions,
} from '@/lib/video-export/options';
import { getSaveFilePicker, shouldWriteToDisk } from '@/lib/video-export/saveTarget';
import { useFormatPreview, useVideoExport } from './useVideoExport';

// The same class string as the other round controls of the bar (PlayerControls' `controlClass`), on Radix's own trigger
// element rather than the shared Button, whose variant colours would override these.
const TRIGGER_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--player-border)] bg-[var(--player-control)] text-[var(--player-text)] transition hover:bg-[var(--player-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40';

/** A row of mutually exclusive choices. */
function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; text: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={String(option.value)}
            size="sm"
            variant={option.value === value ? 'primary' : 'neutral'}
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.text}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * The player's "Export video" button and its dialog: choose the layout, frame rate, highlight and audio, see what
 * the browser will make (container, size, length), then export and download. Download only: nothing leaves the page.
 */
export default function ExportVideoControl({
  score,
  durationMs,
  disabled,
  disabledReason,
  testId = 'player-export-video',
}: {
  score: Score | null;
  durationMs: number;
  disabled?: boolean;
  /** Why the button is off, shown as its tooltip (for example while playing). */
  disabledReason?: string;
  /** Two instances exist (bar and small-screen menu); each needs its own id. */
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<VideoExportOptions>(DEFAULT_OPTIONS);
  // null = decide by size; a choice made in the dialog wins.
  const [saveToFile, setSaveToFile] = useState<boolean | null>(null);
  const { state, start, cancel, reset } = useVideoExport(score);
  const format = useFormatPreview(options, open);
  const running = state.status === 'running';

  const estimate = useMemo(() => estimateBytes(durationMs, options), [durationMs, options]);
  const picker = open ? getSaveFilePicker() : null;
  const toDisk =
    format?.ok === true && picker !== null && (saveToFile ?? shouldWriteToDisk(estimate, picker));
  const set = <K extends keyof VideoExportOptions>(key: K, value: VideoExportOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const onOpenChange = (next: boolean) => {
    if (running) return; // Cancel is the way out of a running export.
    if (next) {
      // Open on the highlight the player is showing.
      const remembered = readPlayerPreference('ots-player-highlight');
      setOptions((current) => ({
        ...current,
        highlight: remembered === 'note' ? 'note' : 'measure',
      }));
    } else reset();
    setOpen(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger
          data-testid={testId}
          className={TRIGGER_CLASS}
          disabled={disabled || !score}
          title={disabled && disabledReason ? disabledReason : 'Export video'}
          aria-label="Export video"
        >
          <Film size={17} aria-hidden="true" />
        </DialogTrigger>
        <DialogContent className="max-w-md" data-testid="export-video-dialog">
          <DialogPrimitive.Title className="text-lg font-semibold text-slate-900">
            Export video
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
            Makes a video of the score with the sound, and downloads it. Nothing is uploaded.
          </DialogPrimitive.Description>

          <div className="mt-4 flex flex-col gap-3">
            <Choice
              label="Layout"
              value={options.layout}
              disabled={running}
              options={[
                { value: 'landscape', text: 'Landscape' },
                { value: 'portrait', text: 'Portrait' },
              ]}
              onChange={(value) => set('layout', value)}
            />
            <Choice
              label="Frame rate"
              value={options.fps}
              disabled={running}
              options={[
                { value: 30, text: '30 fps' },
                { value: 60, text: '60 fps' },
              ]}
              onChange={(value) => set('fps', value)}
            />
            <Choice
              label="Highlight"
              value={options.highlight}
              disabled={running}
              options={[
                { value: 'measure', text: 'Measure' },
                { value: 'note', text: 'Note' },
              ]}
              onChange={(value) => set('highlight', value)}
            />
            <Choice
              label="Sound"
              value={options.audio}
              disabled={running}
              options={[
                { value: true, text: 'With sound' },
                { value: false, text: 'Silent' },
              ]}
              onChange={(value) => set('audio', value)}
            />
            <Choice
              label="Cursor"
              value={options.cursor}
              disabled={running}
              options={[
                { value: false, text: 'None' },
                { value: true, text: 'Moving cursor' },
              ]}
              onChange={(value) => set('cursor', value)}
            />
          </div>

          {picker && (
            <div className="mt-3">
              <Choice
                label="Save"
                value={toDisk}
                disabled={running}
                options={[
                  { value: false, text: 'Download' },
                  { value: true, text: 'Choose file' },
                ]}
                onChange={setSaveToFile}
              />
            </div>
          )}

          <p className="mt-4 text-xs text-slate-600" data-testid="export-video-summary">
            {format === null
              ? 'Checking this browser…'
              : format.ok
                ? `${format.extension.toUpperCase()} · ${formatPlaybackTime(durationMs)} · about ${formatBytes(estimate)}${toDisk ? ' · written to the file you choose' : ''}`
                : format.reason}
          </p>

          {running && (
            <div className="mt-3" data-testid="export-video-progress">
              <progress
                className="h-2 w-full"
                max={state.frameCount}
                value={state.framesDone}
                aria-label="Export progress"
              />
              <p className="mt-1 text-xs text-slate-600" role="status">
                Frame {state.framesDone} of {state.frameCount}
              </p>
            </div>
          )}
          {state.status === 'done' && (
            <p className="mt-3 text-sm text-emerald-700" role="status">
              Saved {state.fileName} ({formatBytes(state.bytes)}).
              {state.note && (
                <span className="mt-1 block text-xs text-slate-600">{state.note}</span>
              )}
            </p>
          )}
          {state.status === 'error' && (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {state.message}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            {running ? (
              <Button variant="neutral" onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <>
                <Button variant="neutral" onClick={() => onOpenChange(false)}>
                  {state.status === 'done' ? 'Close' : 'Cancel'}
                </Button>
                <Button
                  variant="primary"
                  data-testid="export-video-start"
                  disabled={!format || !format.ok || !score}
                  onClick={() =>
                    void start(
                      options,
                      toDisk && format?.ok
                        ? { extension: format.extension, mimeType: format.mimeType }
                        : undefined,
                    )
                  }
                >
                  Export
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
