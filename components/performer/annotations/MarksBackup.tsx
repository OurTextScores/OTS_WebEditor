'use client';

import React, { useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { backupFileName, backupOf, parseBackup } from './annotationBackup';
import type { AnnotationStore } from './annotationStore';

/**
 * Back up every mark on this device to a file, or restore marks from one (merged: a mark already here is replaced by
 * the backup's copy, others are kept). Marks live only on the device until sync exists; this is how they move or
 * survive a cleared browser.
 */
export function MarksBackup({
  store,
  onRestored,
}: {
  store: AnnotationStore;
  onRestored: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const backUp = async () => {
    const annotations = await store.all();
    const blob = new Blob([JSON.stringify(backupOf(annotations))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName();
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote(`Backed up ${annotations.length} mark${annotations.length === 1 ? '' : 's'}.`);
  };

  const restore = async (file: File) => {
    const parsed = parseBackup(await file.text());
    if ('error' in parsed) {
      setNote(parsed.error);
      return;
    }
    for (const annotation of parsed.annotations) await store.put(annotation);
    onRestored();
    const skipped = parsed.skipped ? ` (${parsed.skipped} damaged, skipped)` : '';
    setNote(
      `Restored ${parsed.annotations.length} mark${parsed.annotations.length === 1 ? '' : 's'}${skipped}.`,
    );
  };

  return (
    <>
      <Button type="button" size="sm" data-testid="marks-backup" onClick={() => void backUp()}>
        Back up marks
      </Button>
      <Button
        type="button"
        size="sm"
        data-testid="marks-restore"
        onClick={() => fileInput.current?.click()}
      >
        Restore marks…
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="marks-restore-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void restore(file);
        }}
      />
      {note && (
        <span role="status" data-testid="marks-note" className="text-xs text-slate-600">
          {note}
        </span>
      )}
    </>
  );
}
