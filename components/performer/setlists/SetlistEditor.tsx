'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { performHref } from '../platform/performPath';
import { keepScoreFile } from '../platform/scoreFiles';
import { deviceScoreStore } from '../platform/scoreStore';
import { ScoreFileButton } from './ScoreFileButton';
import { makeAvailableOffline, offlineStates, storageEstimate, type OfflineState } from './offline';
import { addItem, moveItem, removeItem, renameSetlist, type Setlist } from './setlistModel';

const pieceHref = (setlist: Setlist, item: number) => performHref({ setlist: setlist.id, item });

const OFFLINE_LABEL: Record<OfflineState, string> = {
  'on-device': 'On device',
  fetching: 'Saving…',
  failed: 'Not saved',
  'online-only': 'Online only',
};

/** One setlist in the library: perform from any piece, reorder, remove, add a score file, rename, delete. */
export function SetlistEditor({
  setlist,
  onSave,
  onDelete,
}: {
  setlist: Setlist;
  onSave: (setlist: Setlist) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(setlist.name);
  const [scores] = useState(deviceScoreStore);
  const [offline, setOffline] = useState<OfflineState[]>([]);
  const [storage, setStorage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void offlineStates(setlist, scores).then((states) => live && setOffline(states));
    return () => {
      live = false;
    };
  }, [setlist, scores]);
  const saveOffline = async () => {
    await makeAvailableOffline(setlist, scores, (index, state) =>
      setOffline((states) => states.map((value, at) => (at === index ? state : value))),
    );
    const estimate = await storageEstimate();
    setStorage(
      estimate ? `${estimate.usedMb} MB used of ${estimate.quotaMb} MB on this device.` : null,
    );
  };
  /** Delete asks once more (its scores stay on the device either way). */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** A score file from the device: kept there (local:<id>) and added as the last piece. */
  const addFile = async (file: File) => {
    const kept = await keepScoreFile(file, scores);
    onSave(addItem(setlist, { score: kept.key, name: kept.name }));
  };
  return (
    <div data-testid="setlist-editor" className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <ol className="space-y-1">
        {setlist.items.map((item, index) => (
          <li key={`${item.score}:${index}`} className="flex items-center gap-2">
            <span className="w-6 text-right text-slate-400">{index + 1}.</span>
            <a className="flex-1 truncate text-accent underline" href={pieceHref(setlist, index)}>
              {item.name}
            </a>
            <span data-testid="piece-offline" className="text-xs text-slate-500">
              {offline[index] ? OFFLINE_LABEL[offline[index]] : ''}
            </span>
            <Button
              type="button"
              size="sm"
              aria-label={`Move ${item.name} up`}
              onClick={() => onSave(moveItem(setlist, index, -1))}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label={`Move ${item.name} down`}
              onClick={() => onSave(moveItem(setlist, index, 1))}
            >
              ↓
            </Button>
            <Button
              type="button"
              size="sm"
              aria-label={`Remove ${item.name}`}
              onClick={() => onSave(removeItem(setlist, index))}
            >
              Remove
            </Button>
          </li>
        ))}
        {!setlist.items.length && (
          <li className="text-slate-500">
            No pieces yet: add a score file, or open a score and use “Add to setlist”.
          </li>
        )}
      </ol>
      {setlist.items.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="setlist-offline"
            disabled={offline.includes('fetching')}
            onClick={() => void saveOffline()}
          >
            Make available offline
          </Button>
          {storage && <span className="text-xs text-slate-500">{storage}</span>}
        </div>
      )}
      <div className="flex gap-2">
        <ScoreFileButton
          label="Add a file…"
          testId="setlist-add-file"
          onFile={(file) => void addFile(file)}
        />
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Setlist name"
          className="h-8 flex-1 rounded border border-slate-300 px-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => name.trim() !== setlist.name && onSave(renameSetlist(setlist, name))}
        />
        <Button
          type="button"
          size="sm"
          data-testid="setlist-delete"
          onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
          onBlur={() => setConfirmingDelete(false)}
        >
          {confirmingDelete ? 'Delete — sure?' : 'Delete setlist'}
        </Button>
      </div>
    </div>
  );
}
