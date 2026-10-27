'use client';

import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Code2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import type { HighlightMode } from '@/lib/playback/player-message-api';
import { EmbedPanel } from './EmbedPanel';

// The player bar's round-control look, on Radix's own trigger (as Export video does).
const TRIGGER_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--player-border)] bg-[var(--player-control)] text-[var(--player-text)] transition hover:bg-[var(--player-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40';

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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        {open && (
          <EmbedPanel
            pageHref={window.location.href}
            title={title}
            initialHighlight={highlightMode}
            positionMs={positionMs}
            unavailable={
              <p className="mt-4 text-sm text-slate-700" data-testid="embed-unavailable">
                This score was opened from your computer, so there is no web address to embed.
                Upload it to the website first.
              </p>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
