import { useEffect, useState } from 'react';
import { deviceAnnotationStore } from '../../performer/annotations/annotationStore';
import { deviceScoreStore } from '../../performer/platform/scoreStore';
import type { EditorCore } from '../core';
import { decodeScoreXml } from '../../../lib/webmscore-loader';
import { editorLayout, musicImage } from './markImage';
import { getPartsSnapshot } from '../parts';
import { readMark, type MarksReader } from './readMarks';
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
  reader: MarksReader | null = null,
) {
  const [stores] = useState(() => ({ marks: deviceAnnotationStore(), scores: deviceScoreStore() }));
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [decisions, setDecisions] = useState<Map<string, ReviewDecision>>(new Map());
  const [revision, setRevision] = useState(0);
  const [outcome, setOutcome] = useState<EngraveOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
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

  /** The marks the rules could not read and the model has not read yet. */
  const unread = items.filter(
    (item) =>
      !item.proposal.engrave &&
      'reason' in item.proposal &&
      item.proposal.reason === 'needs-interpretation' &&
      !item.readByAi,
  );

  /** Reads the handwriting with the editor's AI model, one mark at a time; the reviewer still decides each. */
  const readWithAi = async () => {
    const score = core.score;
    if (!reader || !score?.saveXml || !unread.length) return;
    const targets = unread;
    setReading({ done: 0, total: targets.length });
    try {
      const xml = await decodeScoreXml(await score.saveXml());
      // Ink is shown to the model over the printed bars, as laid out here
      const layout = targets.some((item) => item.annotation.kind === 'ink')
        ? await editorLayout(score).catch(() => null)
        : null;
      const viewing = getPartsSnapshot().score === score ? getPartsSnapshot().current : -1;
      for (const [index, item] of targets.entries()) {
        const picture = layout
          ? await musicImage(layout, item.annotation, viewing).catch(() => null)
          : null;
        const proposal = await readMark(reader, item.annotation, xml, picture);
        setItems((previous) =>
          previous.map((candidate) =>
            candidate.annotation.id === item.annotation.id
              ? { ...candidate, proposal, readByAi: true }
              : candidate,
          ),
        );
        setReading({ done: index + 1, total: targets.length });
      }
    } finally {
      setReading(null);
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

  return { items, decisions, decide, engrave, undo, outcome, busy, unread, readWithAi, reading };
}
