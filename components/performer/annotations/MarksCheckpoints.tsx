'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import type { AnnotationStore } from './annotationStore';
import {
  checkpointsOf,
  deviceCheckpointStore,
  restoreCheckpoint,
  saveCheckpoint,
  type MarksCheckpoint,
} from './checkpoints';

/**
 * Checkpoints of this score's marks: save the marks as they are now under a name, and go back to one later. Marks are
 * saved on the device as they are made; a checkpoint is a point to return to ("Before the dress rehearsal").
 */
export function MarksCheckpoints({
  scoreKey,
  marks,
  onRestored,
}: {
  scoreKey: string;
  marks: AnnotationStore;
  onRestored: () => void;
}) {
  const [store] = useState(deviceCheckpointStore);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [list, setList] = useState<MarksCheckpoint[]>([]);
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void checkpointsOf(store, scoreKey).then((found) => live && setList(found));
    return () => {
      live = false;
    };
  }, [open, store, scoreKey, revision]);

  const save = async () => {
    const saved = await saveCheckpoint(marks, store, scoreKey, name);
    setName('');
    setNote(`Saved “${saved.name}”.`);
    setRevision((value) => value + 1);
  };
  const restore = async (checkpoint: MarksCheckpoint) => {
    await restoreCheckpoint(marks, store, checkpoint);
    onRestored();
    setNote(`Restored “${checkpoint.name}”. The marks before are kept as a checkpoint.`);
    setRevision((value) => value + 1);
  };

  return (
    <span className="relative">
      <Button
        type="button"
        size="sm"
        aria-expanded={open}
        data-testid="marks-checkpoints"
        onClick={() => setOpen(!open)}
      >
        Checkpoints…
      </Button>
      {open && (
        <div
          data-testid="marks-checkpoints-panel"
          data-performer-controls
          className="absolute right-0 top-12 z-20 w-80 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <p className="text-xs text-slate-500">
            Marks are saved as you make them. A checkpoint keeps them as they are now.
          </p>
          <div className="flex gap-2">
            <input
              aria-label="Checkpoint name"
              data-testid="checkpoint-name"
              className="h-8 min-w-0 flex-1 rounded border border-slate-300 px-2"
              placeholder="Name (e.g. Before the concert)"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void save()}
            />
            <Button
              type="button"
              size="sm"
              variant="primary"
              data-testid="checkpoint-save"
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {list.map((checkpoint) => (
              <li key={checkpoint.id} data-testid="checkpoint" className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{checkpoint.name}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(checkpoint.createdAt).toLocaleString()} ·{' '}
                    {checkpoint.annotations.length} mark
                    {checkpoint.annotations.length === 1 ? '' : 's'}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  data-testid="checkpoint-restore"
                  onClick={() => void restore(checkpoint)}
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  size="sm"
                  aria-label={`Delete ${checkpoint.name}`}
                  onClick={() =>
                    void store.remove(checkpoint.id).then(() => setRevision((value) => value + 1))
                  }
                >
                  Delete
                </Button>
              </li>
            ))}
            {!list.length && <li className="text-sm text-slate-500">No checkpoints yet.</li>}
          </ul>
          {note && (
            <p role="status" data-testid="checkpoint-note" className="text-xs text-slate-600">
              {note}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
