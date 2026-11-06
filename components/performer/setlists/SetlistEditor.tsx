'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { addItem, moveItem, removeItem, renameSetlist, type Setlist } from './setlistModel';

const performHref = (setlist: Setlist, item: number) =>
  `/perform?setlist=${encodeURIComponent(setlist.id)}&item=${item}`;

/** One setlist in the library: perform from any piece, reorder, remove, add a score by link, rename, delete. */
export function SetlistEditor({
  setlist,
  onSave,
  onDelete,
}: {
  setlist: Setlist;
  onSave: (setlist: Setlist) => void;
  onDelete: () => void;
}) {
  const [link, setLink] = useState('');
  const [name, setName] = useState(setlist.name);
  /** Delete asks once more (its scores stay on the device either way). */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const add = () => {
    const score = link.trim();
    if (!score) return;
    const fallback = decodeURIComponent(score.split('/').pop() ?? score).replace(/\.[a-z]+$/i, '');
    onSave(addItem(setlist, { score, name: fallback }));
    setLink('');
  };
  return (
    <div data-testid="setlist-editor" className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      <ol className="space-y-1">
        {setlist.items.map((item, index) => (
          <li key={`${item.score}:${index}`} className="flex items-center gap-2">
            <span className="w-6 text-right text-slate-400">{index + 1}.</span>
            <a
              className="flex-1 truncate text-blue-700 underline"
              href={performHref(setlist, index)}
            >
              {item.name}
            </a>
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
            No pieces yet: open a score and use “Add to setlist”, or add a link.
          </li>
        )}
      </ol>
      <div className="flex gap-2">
        <input
          aria-label="Score link"
          data-testid="setlist-add-link"
          className="h-8 flex-1 rounded border border-slate-300 px-2"
          placeholder="Score link"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
        />
        <Button type="button" size="sm" data-testid="setlist-add" onClick={add}>
          Add
        </Button>
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
