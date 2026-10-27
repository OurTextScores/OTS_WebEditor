'use client';

import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Code2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import {
  embedPlayerUrl,
  embedSnippet,
  isLocalOrigin,
  scoreIsPublic,
  type EmbedOptions,
} from '@/lib/playback/embed-snippet';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import { formatPlaybackTime } from '@/lib/playback/timeline';

// The player bar's round-control look, on Radix's own trigger (as Export video does).
const TRIGGER_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--player-border)] bg-[var(--player-control)] text-[var(--player-text)] transition hover:bg-[var(--player-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40';

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
 * Embed: the HTML that puts this player, with this score, on another website. The snippet is built from the page's
 * own URL (`embed-snippet.ts`), so it plays exactly what is open here; the dialog says when a visitor could not load it.
 */
export default function EmbedSnippetControl({
  title,
  highlightMode,
  positionMs,
  disabled,
  testId = 'player-embed',
}: {
  title: string;
  highlightMode: HighlightMode;
  positionMs: number;
  disabled?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<HighlightMode>(highlightMode);
  const [theme, setTheme] = useState<EmbedOptions['theme']>('auto');
  const [startHere, setStartHere] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const startSeconds = Math.floor(positionMs / 1000);

  const src = useMemo(
    () =>
      open
        ? embedPlayerUrl(window.location.href, {
            highlight,
            theme,
            startSeconds: startHere ? startSeconds : 0,
          })
        : null,
    [highlight, open, startHere, startSeconds, theme],
  );
  const snippet = src ? embedSnippet(src, { title, height }) : '';
  const local = open && isLocalOrigin(window.location.href);

  // Opening the dialog takes the player's current settings and asks whether a visitor could load the score.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setHighlight(highlightMode);
    setStartHere(false);
    setCopied(false);
    setIsPublic(null);
  };
  const scoreUrl = src ? new URL(src).searchParams.get('score') : null;
  useEffect(() => {
    if (!open || !scoreUrl) return;
    let cancelled = false;
    void scoreIsPublic(scoreUrl).then((answer) => {
      if (!cancelled) setIsPublic(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [open, scoreUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      // No clipboard (an insecure page, or permission refused): the text is selected for a manual copy.
      document.querySelector<HTMLTextAreaElement>('[data-testid="embed-snippet"]')?.select();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        data-testid={testId}
        className={TRIGGER_CLASS}
        disabled={disabled}
        title="Embed on a website"
        aria-label="Embed on a website"
      >
        <Code2 size={17} aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="embed-dialog">
        <DialogPrimitive.Title className="text-lg font-semibold text-slate-900">
          Embed on a website
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
          Paste this HTML into your page to show this score with its player.
        </DialogPrimitive.Description>
        {src ? (
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
            <textarea
              readOnly
              aria-label="Embed code"
              data-testid="embed-snippet"
              value={snippet}
              rows={4}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full resize-none rounded border border-slate-300 bg-slate-50 p-2 font-mono text-xs text-slate-800"
            />
            {local && (
              <p role="note" className="text-sm text-amber-700" data-testid="embed-local-warning">
                This player is running on this computer, so the code only works here. Open the score
                on the website to get code that works for everyone.
              </p>
            )}
            {isPublic === false && (
              <p role="note" className="text-sm text-amber-700" data-testid="embed-private-warning">
                Visitors without access to this score will not be able to load it. Embed a public
                score, or make this one public first.
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
        ) : (
          <p className="mt-4 text-sm text-slate-700" data-testid="embed-unavailable">
            This score was opened from your computer, so there is no web address to embed. Upload it
            to the website first.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
