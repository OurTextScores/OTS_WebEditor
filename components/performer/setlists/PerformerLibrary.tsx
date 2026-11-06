'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { performHref } from '../platform/performPath';
import { newSetlist } from './setlistModel';
import { OnThisDevice } from './OnThisDevice';
import { OfflineAppNote } from './OfflineAppNote';
import { SetlistEditor } from './SetlistEditor';
import { useSetlists } from './useSetlists';

/**
 * `/perform` with no score: the performer's library. Setlists (perform, edit, new), and a score opened by its link.
 * Everything here is on this device.
 */
export function PerformerLibrary() {
  const { setlists, save, remove } = useSetlists();
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [link, setLink] = useState('');
  const create = async () => {
    const setlist = newSetlist(newName);
    await save(setlist);
    setNewName('');
    setOpen(setlist.id);
  };
  return (
    <main
      data-testid="performer-library"
      className="mx-auto max-w-2xl space-y-8 p-6 text-slate-800"
    >
      <h1 className="text-2xl font-semibold">Perform</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Setlists</h2>
        <ul className="space-y-2">
          {setlists.map((setlist) => (
            <li
              key={setlist.id}
              data-testid="setlist"
              className="rounded-lg border border-slate-200 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 font-medium">{setlist.name}</span>
                <span className="text-sm text-slate-500">
                  {setlist.items.length} piece{setlist.items.length === 1 ? '' : 's'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  aria-expanded={open === setlist.id}
                  data-testid="setlist-edit"
                  onClick={() => setOpen(open === setlist.id ? null : setlist.id)}
                >
                  Edit
                </Button>
                {setlist.items.length > 0 && (
                  <a
                    data-testid="setlist-perform"
                    className="rounded bg-accent px-3 py-1 text-sm font-medium text-white"
                    href={performHref({ setlist: setlist.id, item: 0 })}
                  >
                    Perform
                  </a>
                )}
              </div>
              {open === setlist.id && (
                <SetlistEditor
                  setlist={setlist}
                  onSave={(next) => void save(next)}
                  onDelete={() => void remove(setlist.id)}
                />
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            aria-label="New setlist name"
            data-testid="setlist-new-name"
            className="h-8 flex-1 rounded border border-slate-300 px-2"
            placeholder="New setlist"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void create()}
          />
          <Button type="button" size="sm" data-testid="setlist-new" onClick={() => void create()}>
            New setlist
          </Button>
        </div>
      </section>

      <OnThisDevice />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Open a score</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (link.trim()) window.location.assign(performHref({ score: link.trim() }));
          }}
        >
          <input
            aria-label="Score link to open"
            className="h-8 flex-1 rounded border border-slate-300 px-2"
            placeholder="Score link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
          <Button type="submit" size="sm">
            Open
          </Button>
        </form>
      </section>

      <OfflineAppNote />
      <p className="text-sm text-slate-500">
        <a className="underline" href={performHref({ selftest: true })}>
          Device self-test
        </a>
      </p>
    </main>
  );
}
