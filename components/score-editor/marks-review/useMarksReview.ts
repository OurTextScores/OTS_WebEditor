import { useEffect, useState } from 'react';
import { deviceAnnotationStore } from '../../performer/annotations/annotationStore';
import { deviceScoreStore } from '../../performer/platform/scoreStore';
import type { EditorCore } from '../core';
import { engraveMarks, restoreBeforeEngraving, type EngraveOutcome } from './engraveMarks';
import {
  defaultDecision,
  reviewItemsOf,
  type ReviewDecision,
  type ReviewItem,
} from './reviewItems';

/**
 * The rehearsal marks performer mode keeps on this device for the score the editor has open (by the address it was
 * opened with: a score link or local:<id>), the reviewer's decisions, engraving them, and undoing that.
 */
export function useMarksReview(
  core: Pick<EditorCore, 'score' | 'performMutation' | 'runSerializedScoreOperation'>,
  scoreKey: string | null,
) {
  const [stores] = useState(() => ({ marks: deviceAnnotationStore(), scores: deviceScoreStore() }));
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [decisions, setDecisions] = useState<Map<string, ReviewDecision>>(new Map());
  const [revision, setRevision] = useState(0);
  const [outcome, setOutcome] = useState<EngraveOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const hasScore = Boolean(core.score);

  useEffect(() => {
    if (!scoreKey || !hasScore) return;
    let live = true;
    void stores.marks
      .list(scoreKey)
      .then((annotations) => {
        if (!live) return;
        const next = reviewItemsOf(annotations);
        setItems(next);
        setDecisions(new Map(next.map((item) => [item.annotation.id, defaultDecision(item)])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [stores, scoreKey, hasScore, revision]);

  const decide = (id: string, decision: ReviewDecision) =>
    setDecisions((previous) => new Map(previous).set(id, decision));

  const engrave = async () => {
    if (!scoreKey) return;
    setBusy(true);
    try {
      const result = await engraveMarks({ core, scoreKey, items, decisions, ...stores });
      setOutcome(result);
      setRevision((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };

  /** Undo engraving: the editor's Undo for the notation, then the marks and the performer's copy as they were. */
  const undo = async (undoNotation: () => Promise<unknown> | unknown) => {
    if (!outcome || !scoreKey) return;
    if (outcome.engraved.length) await undoNotation();
    await restoreBeforeEngraving(outcome, stores.marks, stores.scores, scoreKey);
    setOutcome(null);
    setRevision((value) => value + 1);
  };

  return { items, decisions, decide, engrave, undo, outcome, busy };
}
