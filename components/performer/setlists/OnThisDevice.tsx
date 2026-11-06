'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { performHref } from '../platform/performPath';
import { deviceScoreStore, isLocalScore, type StoredScore } from '../platform/scoreStore';

/** Scores handed over from the editor (kept on this device only): perform or delete. */
export function OnThisDevice() {
  const [store] = useState(deviceScoreStore);
  const [scores, setScores] = useState<StoredScore[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    void store
      .all()
      .then((all) => {
        if (live)
          setScores(
            all.filter((score) => isLocalScore(score.key)).sort((a, b) => b.savedAt - a.savedAt),
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [store, revision]);
  if (!scores.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">From the editor</h2>
      <ul className="space-y-1">
        {scores.map((score) => (
          <li key={score.key} data-testid="device-score" className="flex items-center gap-2">
            <a
              className="flex-1 truncate text-accent underline"
              href={performHref({ score: score.key })}
            >
              {score.name}
            </a>
            <span className="text-xs text-slate-500">
              {new Date(score.savedAt).toLocaleDateString()}
            </span>
            <Button
              type="button"
              size="sm"
              aria-label={`Delete ${score.name}`}
              onClick={() =>
                void store.remove(score.key).then(() => setRevision((value) => value + 1))
              }
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
