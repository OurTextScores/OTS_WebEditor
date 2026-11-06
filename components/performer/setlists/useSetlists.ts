import { useCallback, useEffect, useState } from 'react';
import type { Setlist } from './setlistModel';
import { deviceSetlistStore, sortedSetlists, type SetlistStore } from './setlistStore';

/** The device's setlists, newest edited first, with save and delete. */
export function useSetlists(store?: SetlistStore) {
  const [table] = useState(() => store ?? deviceSetlistStore());
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void table
      .all()
      .then((all) => live && setSetlists(sortedSetlists(all)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [table, revision]);
  const refresh = () => setRevision((value) => value + 1);
  const save = useCallback(
    async (setlist: Setlist) => {
      await table.put(setlist);
      setRevision((value) => value + 1);
    },
    [table],
  );
  const remove = useCallback(
    async (id: string) => {
      await table.remove(id);
      setRevision((value) => value + 1);
    },
    [table],
  );
  return { setlists, save, remove, refresh };
}
