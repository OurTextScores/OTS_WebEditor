'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { addItem, newSetlist } from './setlistModel';
import { useSetlists } from './useSetlists';

/** In the perform view's controls: add the open score to a setlist (or a new one). */
export function AddToSetlist({ score, name }: { score: string; name: string }) {
  const { setlists, save } = useSetlists();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const addTo = async (setlist = newSetlist('Setlist')) => {
    await save(addItem(setlist, { score, name: name || 'Untitled' }));
    setNote(`Added to ${setlist.name}.`);
    setOpen(false);
  };
  return (
    <span className="relative">
      <Button type="button" size="sm" data-testid="add-to-setlist" onClick={() => setOpen(!open)}>
        Add to setlist…
      </Button>
      {open && (
        <ul
          data-testid="add-to-setlist-menu"
          className="absolute left-0 top-9 z-20 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {setlists.map((setlist) => (
            <li key={setlist.id}>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                className="w-full justify-start"
                onClick={() => void addTo(setlist)}
              >
                {setlist.name}
              </Button>
            </li>
          ))}
          <li>
            <Button
              type="button"
              size="sm"
              variant="quiet"
              className="w-full justify-start"
              onClick={() => void addTo()}
            >
              New setlist
            </Button>
          </li>
        </ul>
      )}
      {note && (
        <span role="status" className="ml-2 text-xs text-slate-600">
          {note}
        </span>
      )}
    </span>
  );
}
