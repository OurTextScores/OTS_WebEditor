'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  embedPlayerUrl,
  embedSnippet,
  isLocalOrigin,
  scoreIsPublic,
  type EmbedOptions,
} from '@/lib/playback/embed-snippet';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import { formatPlaybackTime } from '@/lib/playback/timeline';

const DEFAULT_HEIGHT = 600;

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; text: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center justify-between gap-3">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={option.value === value ? 'primary' : 'neutral'}
            aria-pressed={option.value === value}
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
 * The body of an Embed dialog, for the player and the editor: the visitor's settings, the HTML to paste, a copy
 * button, and a warning when a visitor could not load the score. Mounted when its dialog opens, so every opening
 * starts from the caller's current settings. With no score address it shows `unavailable` instead.
 */
export function EmbedPanel({
  pageHref,
  scoreSource,
  title,
  initialHighlight,
  positionMs = 0,
  note,
  unavailable,
}: {
  /** The page the player URL is built from (its origin and path; its `score` unless `scoreSource` is given). */
  pageHref: string;
  scoreSource?: string;
  title: string;
  initialHighlight: HighlightMode;
  /** Where playback is: offered as the start of the embedded player. */
  positionMs?: number;
  /** Shown above the code: what the visitor will and will not see. */
  note?: ReactNode;
  unavailable: ReactNode;
}) {
  const [highlight, setHighlight] = useState<HighlightMode>(initialHighlight);
  const [theme, setTheme] = useState<EmbedOptions['theme']>('auto');
  const [startHere, setStartHere] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  // Kept with what they answer for, so a changed snippet or score reads as not copied / not yet known.
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [publicAnswer, setPublicAnswer] = useState<{ url: string; answer: boolean | null } | null>(
    null,
  );
  const startSeconds = Math.floor(positionMs / 1000);

  const src = useMemo(
    () =>
      embedPlayerUrl(
        pageHref,
        { highlight, theme, startSeconds: startHere ? startSeconds : 0 },
        scoreSource,
      ),
    [highlight, pageHref, scoreSource, startHere, startSeconds, theme],
  );
  const snippet = src ? embedSnippet(src, { title, height }) : '';
  const scoreUrl = src ? new URL(src).searchParams.get('score') : null;

  const isPublic = publicAnswer?.url === scoreUrl ? publicAnswer.answer : null;
  const copied = copiedSnippet === snippet;

  useEffect(() => {
    if (!scoreUrl) return;
    let cancelled = false;
    void scoreIsPublic(scoreUrl).then((answer) => {
      if (!cancelled) setPublicAnswer({ url: scoreUrl, answer });
    });
    return () => {
      cancelled = true;
    };
  }, [scoreUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedSnippet(snippet);
    } catch {
      // No clipboard (an insecure page, or permission refused): the text is selected for a manual copy.
      document.querySelector<HTMLTextAreaElement>('[data-testid="embed-snippet"]')?.select();
    }
  };

  if (!src) return <>{unavailable}</>;
  return (
    <div className="mt-4 flex flex-col gap-3">
      <Choice
        label="Highlight"
        value={highlight}
        onChange={setHighlight}
        options={[
          { value: 'measure', text: 'Measures' },
          { value: 'note', text: 'Notes' },
        ]}
      />
      <Choice
        label="Theme"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'auto', text: 'Auto' },
          { value: 'light', text: 'Light' },
          { value: 'dark', text: 'Dark' },
        ]}
      />
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        Height (pixels)
        <input
          type="number"
          min={240}
          max={2000}
          step={10}
          value={height}
          data-testid="embed-height"
          onChange={(event) =>
            setHeight(Math.min(2000, Math.max(240, Number(event.currentTarget.value) || 0)))
          }
          className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
        />
      </label>
      {startSeconds > 0 && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={startHere}
            data-testid="embed-start-here"
            onChange={(event) => setStartHere(event.currentTarget.checked)}
          />
          Start at {formatPlaybackTime(startSeconds * 1000)}
        </label>
      )}
      {note}
      <textarea
        readOnly
        aria-label="Embed code"
        data-testid="embed-snippet"
        value={snippet}
        rows={4}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-none rounded border border-slate-300 bg-slate-50 p-2 font-mono text-xs text-slate-800"
      />
      {isLocalOrigin(pageHref) && (
        <p role="note" className="text-sm text-warning" data-testid="embed-local-warning">
          This page is running on this computer, so the code only works here. Open the score on the
          website to get code that works for everyone.
        </p>
      )}
      {isPublic === false && (
        <p role="note" className="text-sm text-warning" data-testid="embed-private-warning">
          Visitors without access to this score will not be able to load it. Embed a public score,
          or make this one public first.
        </p>
      )}
      <div className="flex justify-end">
        <Button data-testid="embed-copy" onClick={() => void copy()}>
          {copied ? (
            <Check size={14} className="mr-1.5" aria-hidden="true" />
          ) : (
            <Copy size={14} className="mr-1.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </div>
    </div>
  );
}
