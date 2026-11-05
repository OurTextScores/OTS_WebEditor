'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import type { CommandRegistry } from '../../../lib/commands/registry';
import { confirmDialog } from '../../shell/notices';
import { invokeCommand } from '../../shell/invokeCommand';
import { Button } from '../../ui/Button';
import { Dialog, DialogContent } from '../../ui/Dialog';
import { getPartsSnapshot, setPartsSnapshot, subscribeToParts } from './partsStore';

const inputClass =
  'h-7 min-w-0 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800';

/** One part: its name (renamed on Enter or leaving the field), its instruments, and what can be done to it. */
function PartRow({
  index,
  name,
  instruments,
  run,
}: {
  index: number;
  name: string;
  instruments: string[];
  run: (id: string, arg?: unknown) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(name);
  // The row is keyed by the name, so a rename (or an undo of one) starts it afresh.
  const commit = () => {
    if (draft.trim() && draft !== name) void run('view.part.rename', { index, name: draft });
    else setDraft(name);
  };
  return (
    <li className="flex items-center gap-2 py-1.5" data-testid={`part-row-${index}`}>
      <input
        aria-label={`Name of part ${index + 1}`}
        data-testid={`part-name-${index}`}
        className={`${inputClass} w-40`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      <span
        className="min-w-0 flex-1 truncate text-xs text-slate-500"
        title={instruments.join(', ')}
      >
        {instruments.join(', ')}
      </span>
      <Button
        type="button"
        size="sm"
        variant="quiet"
        data-testid={`part-duplicate-${index}`}
        onClick={() => void run('view.part.duplicate', index)}
      >
        Duplicate
      </Button>
      <Button
        type="button"
        size="sm"
        variant="quiet"
        data-testid={`part-reset-${index}`}
        title="Make the part again from the full score, dropping its own layout and changes"
        onClick={() => void run('view.part.reset', index)}
      >
        Reset
      </Button>
      <Button
        type="button"
        size="sm"
        variant="quiet"
        data-testid={`part-delete-${index}`}
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Delete the part “${name}”?`,
            message: 'The music stays in the full score; the part’s own layout is lost.',
            confirmLabel: 'Delete',
          });
          if (ok) await run('view.part.remove', index);
        }}
      >
        Delete
      </Button>
    </li>
  );
}

/**
 * Manage Parts (roadmap E18, slice 4), after MuseScore's Parts dialog: rename, duplicate, reset and delete parts, and
 * make a new one from the score's instruments. Every change is one undoable edit, made through a command.
 */
export function ManagePartsDialog({ registry }: { registry: CommandRegistry }) {
  const { score, parts, managing } = useSyncExternalStore(
    subscribeToParts,
    getPartsSnapshot,
    getPartsSnapshot,
  );
  const [instruments, setInstruments] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [chosen, setChosen] = useState<number[]>([]);
  const run = (id: string, arg?: unknown) => invokeCommand(id, arg, registry);

  // The full score's instruments, for a new part: read when the dialog opens.
  useEffect(() => {
    if (!managing || !score?.metadata) return;
    let live = true;
    void Promise.resolve(score.metadata())
      .then((metadata) => {
        const list = Array.isArray(metadata?.parts) ? metadata.parts : [];
        if (live)
          setInstruments(
            list.map((part) => String((part as { name?: unknown }).name ?? 'Instrument')),
          );
      })
      .catch(() => live && setInstruments([]));
    return () => {
      live = false;
    };
  }, [managing, score]);

  return (
    <Dialog open={managing} onOpenChange={(open) => !open && setPartsSnapshot({ managing: false })}>
      {managing ? (
        <DialogContent className="max-w-xl" data-testid="manage-parts-dialog">
          <DialogPrimitive.Title className="text-base font-semibold text-slate-900">
            Parts
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
            Each part is a score for its players, linked to the full score.
          </DialogPrimitive.Description>
          {parts.length ? (
            <ul className="mt-3 divide-y divide-slate-100" data-testid="manage-parts-list">
              {parts.map((part, index) => (
                <PartRow
                  key={`${index}:${part.name}`}
                  index={index}
                  name={part.name}
                  instruments={part.instruments}
                  run={run}
                />
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
              No parts yet.
              <Button type="button" size="sm" onClick={() => void run('view.part.generate')}>
                Make parts from instruments
              </Button>
            </div>
          )}
          <form
            className="mt-4 space-y-2 border-t border-slate-200 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run('view.part.create', { name: newName || 'Part', partIndices: chosen }).then(
                () => {
                  setNewName('');
                  setChosen([]);
                },
              );
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                New part
              </span>
              <input
                aria-label="New part name"
                data-testid="new-part-name"
                placeholder="Part"
                className={`${inputClass} flex-1`}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                data-testid="btn-new-part"
                disabled={chosen.length === 0}
              >
                Create
              </Button>
            </div>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
              <legend className="sr-only">Instruments in the new part</legend>
              {instruments.map((name, index) => (
                <label
                  key={`${index}:${name}`}
                  className="flex items-center gap-1.5 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    data-testid={`new-part-instrument-${index}`}
                    checked={chosen.includes(index)}
                    onChange={(event) =>
                      setChosen((list) =>
                        event.target.checked
                          ? [...list, index].sort((a, b) => a - b)
                          : list.filter((i) => i !== index),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </fieldset>
          </form>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="quiet"
              onClick={() => setPartsSnapshot({ managing: false })}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
