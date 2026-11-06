'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PerformerView } from '../view/PerformerView';
import type { Setlist } from './setlistModel';
import { deviceSetlistStore } from './setlistStore';

/** `/perform?setlist=<id>&item=<n>`: the setlist's piece n in the perform view, with the setlist's edge turns. */
export function SetlistPerformer({ setlistId, item }: { setlistId: string; item: number }) {
  const router = useRouter();
  const [store] = useState(deviceSetlistStore);
  const [setlist, setSetlist] = useState<Setlist | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void store
      .get(setlistId)
      .then((found) => live && setSetlist(found ?? null))
      .catch(() => live && setSetlist(null));
    return () => {
      live = false;
    };
  }, [store, setlistId]);

  if (setlist === undefined) return null;
  const piece = setlist?.items[item];
  if (!setlist || !piece) {
    return (
      <div
        role="alert"
        className="flex h-screen flex-col items-center justify-center gap-3 text-slate-600"
      >
        This setlist or piece is not on this device.
        <a className="text-blue-700 underline" href="/perform">
          Back to the library
        </a>
      </div>
    );
  }
  return (
    <PerformerView
      key={`${setlistId}:${item}`}
      scoreUrl={piece.score}
      setlist={{
        name: setlist.name,
        index: item,
        names: setlist.items.map((entry) => entry.name),
        scores: setlist.items.map((entry) => entry.score),
        go: (index) =>
          router.replace(`/perform?setlist=${encodeURIComponent(setlistId)}&item=${index}`),
      }}
    />
  );
}
