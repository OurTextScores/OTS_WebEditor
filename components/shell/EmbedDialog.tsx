'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useState, useSyncExternalStore } from 'react';
import { EmbedPanel } from '../score-player/EmbedPanel';
import { initialHighlightMode } from '../score-player/useNoteHighlight';
import { Dialog, DialogContent } from '../ui/Dialog';
import { isGoogleDriveScoreUrl } from '../../lib/public-score-url';
import { getShellUiState, setEmbedOpen, subscribeToShellUi } from './shellStore';

const readOpen = () => getShellUiState().embedOpen;

/**
 * File ▸ Embed on a Website: the player's embed code, from the editor. The embedded player loads the score from its
 * web address: the editor's own `score`, or, for a score opened from this computer, a public Google Drive link pasted
 * here (as Create Share Link takes one). Edits not saved back to that address are not in it, and the dialog says so.
 */
export function EmbedDialog({ title }: { title: string }) {
  const open = useSyncExternalStore(subscribeToShellUi, readOpen, readOpen);
  return (
    <Dialog open={open} onOpenChange={setEmbedOpen}>
      <DialogContent className="max-w-lg" data-testid="embed-dialog">
        <DialogPrimitive.Title className="text-lg font-semibold text-slate-900">
          Embed on a website
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
          Paste this HTML into your page to show this score with a player.
        </DialogPrimitive.Description>
        {open && <EmbedDialogBody title={title} />}
      </DialogContent>
    </Dialog>
  );
}

function EmbedDialogBody({ title }: { title: string }) {
  const { hasScore, dirty } = getShellUiState().view;
  const [driveUrl, setDriveUrl] = useState('');
  // A deployment may name the editor's public address (as Create Share Link uses it); otherwise this page's.
  const base = process.env.NEXT_PUBLIC_SCORE_EDITOR_PUBLIC_URL?.trim() || window.location.href;
  const pageScore = new URL(window.location.href).searchParams.get('score');
  const drive = driveUrl.trim();
  const driveValid = isGoogleDriveScoreUrl(drive);

  if (!hasScore) {
    return (
      <p className="mt-4 text-sm text-slate-700" data-testid="embed-unavailable">
        Open a score first.
      </p>
    );
  }
  if (!pageScore) {
    return (
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-sm text-slate-700">
          This score was opened from your computer, so it has no web address yet. Save it to Google
          Drive, share it with anyone who has the link, and paste that link here.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Google Drive share link
          </span>
          <input
            data-testid="embed-drive-url"
            type="url"
            value={driveUrl}
            onChange={(event) => setDriveUrl(event.currentTarget.value)}
            placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        {drive && !driveValid && (
          <p className="text-sm text-danger">
            Paste a Google Drive file share link, not a folder link.
          </p>
        )}
        {driveValid && (
          <EmbedPanel
            pageHref={base}
            scoreSource={drive}
            title={title}
            initialHighlight={initialHighlightMode(null)}
            unavailable={null}
          />
        )}
      </div>
    );
  }
  return (
    <EmbedPanel
      pageHref={base}
      scoreSource={pageScore}
      title={title}
      initialHighlight={initialHighlightMode(null)}
      note={
        <p className="text-sm text-slate-600" data-testid="embed-saved-note">
          The player loads the score from its web address
          {dirty
            ? ', so the changes you have made here will not be in it until they are saved there.'
            : '.'}
        </p>
      }
      unavailable={
        <p className="mt-4 text-sm text-slate-700" data-testid="embed-unavailable">
          This score&apos;s address cannot be loaded from another website.
        </p>
      }
    />
  );
}
