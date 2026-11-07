import type { Annotation } from '../../performer/annotations/annotationModel';
import type { AnnotationStore } from '../../performer/annotations/annotationStore';
import type { EngravingMark } from '../../performer/engraving/stampEngraving';
import { readBarSignatures, remapAnchor } from '../../performer/annotations/barSignatures';
import type { ScoreStore, StoredScore } from '../../performer/platform/scoreStore';
import type { EditorCore } from '../core';
import { getPartsSnapshot, withFullScore } from '../parts';
import type { ReviewDecision, ReviewItem } from './reviewItems';

/** The open score's (or part's) bars: their signatures and first ticks, by bar index. */
async function barsOf(score: NonNullable<EditorCore['score']>) {
  const signatures = await readBarSignatures(
    async (partIndex) => (await score.measureSignatures?.(partIndex)) ?? [],
  );
  const positions = await score.measurePositions().catch(() => null);
  const ticks: (number | undefined)[] = [];
  for (const element of positions?.elements ?? []) ticks[element.id] = element.writtenTick;
  return { signatures, ticks };
}

/**
 * Where a reviewed mark goes in the score open here: its bar found again by its signature (bars may have been inserted
 * or removed since it was made), and its beat (ticks from the bar's start) made absolute. A mark whose bar has changed
 * is not engraved (it could land on the wrong music).
 */
export function placeMark(
  mark: EngravingMark,
  annotation: Annotation,
  bars: { signatures: readonly string[]; ticks: readonly (number | undefined)[] },
): { engine?: Omit<EngravingMark, 'bar'>; anchor: Annotation['anchor']; reason?: string } {
  const { anchor, status } = remapAnchor(annotation.anchor, bars.signatures);
  if (status === 'changed')
    return { anchor, reason: 'its bar has changed since the mark was made' };
  const start = bars.ticks[anchor.bar];
  if (start === undefined) return { anchor, reason: 'its bar is not in this score' };
  const engine = {
    kind: mark.kind,
    subtype: mark.subtype,
    staff: mark.staff,
    tick: start + mark.tick,
    y: mark.y,
  };
  return { engine, anchor };
}

export interface EngraveOutcome {
  readonly engraved: Annotation[];
  readonly declined: { annotation: Annotation; reason: string }[];
  readonly deleted: Annotation[];
  /** For Undo engraving: the marks and the performer's copy of the score as they were. */
  readonly before: { annotations: Annotation[]; storedScore: StoredScore | undefined };
}

/**
 * Engraves the marks the reviewer accepted (Phase 7a), as one edit in the editor (one Undo), each in the part it was
 * made in; deletes the marks the reviewer deleted; marks the engraved ones as such (performer mode then shows only the
 * notation); and keeps the engraved score as performer mode's copy of it, so the performer sees the engraving.
 */
export async function engraveMarks(input: {
  core: Pick<EditorCore, 'score' | 'performMutation' | 'runSerializedScoreOperation'>;
  scoreKey: string;
  items: readonly ReviewItem[];
  decisions: ReadonlyMap<string, ReviewDecision>;
  marks: AnnotationStore;
  scores: ScoreStore;
  now?: Date;
}): Promise<EngraveOutcome | null> {
  const { core, items, decisions, marks, scores, scoreKey } = input;
  const score = core.score;
  if (!score?.addElementsAt) return null;
  const chosen = items.filter(
    (item) => decisions.get(item.annotation.id) === 'engrave' && item.proposal.engrave,
  );
  const byPart = new Map<number, { item: ReviewItem; mark: EngravingMark }[]>();
  for (const item of chosen) {
    const list = byPart.get(item.annotation.scorePart) ?? [];
    list.push({ item, mark: item.proposal.engrave! });
    byPart.set(item.annotation.scorePart, list);
  }
  const before = {
    annotations: items.map((item) => item.annotation),
    storedScore: await scores.get(scoreKey).catch(() => undefined),
  };

  const engraved: Annotation[] = [];
  const declined: EngraveOutcome['declined'] = [];
  if (byPart.size) {
    await core.performMutation(
      'Engrave rehearsal marks',
      async () => {
        const viewing = getPartsSnapshot().score === score ? getPartsSnapshot().current : -1;
        try {
          for (const [part, entries] of byPart) {
            if (score.setExcerptId && part !== viewing) await score.setExcerptId(part);
            // Each mark at its bar in this score (found again if bars moved), its beat made absolute
            const bars = await barsOf(score);
            const placed = entries.map((entry) => ({
              entry,
              ...placeMark(entry.mark, entry.item.annotation, bars),
            }));
            for (const { entry, reason } of placed) {
              if (reason) declined.push({ annotation: entry.item.annotation, reason });
            }
            const sendable = placed.filter((candidate) => candidate.engine);
            const results = sendable.length
              ? await score.addElementsAt!(sendable.map((candidate) => candidate.engine!))
              : [];
            sendable.forEach(({ entry, anchor }, index) => {
              const result = results[index];
              if (result?.ok) engraved.push({ ...entry.item.annotation, anchor });
              else
                declined.push({
                  annotation: entry.item.annotation,
                  reason: result?.reason ?? 'not engraved',
                });
            });
          }
        } finally {
          if (score.setExcerptId) await score.setExcerptId(viewing);
        }
      },
      { clearSelection: true },
    );
  }

  const version = `${(input.now ?? new Date()).toISOString()} editor`;
  for (const annotation of engraved) await marks.put({ ...annotation, engravedIn: version });
  const deleted = items
    .filter((item) => decisions.get(item.annotation.id) === 'delete')
    .map((item) => item.annotation);
  for (const annotation of deleted) await marks.remove(annotation.id);
  // Kept as marks: reviewed, not offered again
  for (const item of items) {
    if (decisions.get(item.annotation.id) === 'keep')
      await marks.put({ ...item.annotation, reviewedAt: version });
  }

  if (engraved.length) {
    const bytes = await withFullScore(score, core.runSerializedScoreOperation, () =>
      score.saveMsc!('mscz'),
    );
    await scores.put({
      key: scoreKey,
      name: before.storedScore?.name ?? 'Engraved score',
      format: 'mscz',
      bytes,
      savedAt: Date.now(),
    });
  }
  return { engraved, declined, deleted, before };
}

/** Undo engraving: the marks and the performer's copy back as they were (the editor's own Undo reverts the notation). */
export async function restoreBeforeEngraving(
  outcome: EngraveOutcome,
  marks: AnnotationStore,
  scores: ScoreStore,
  scoreKey: string,
): Promise<void> {
  for (const annotation of outcome.before.annotations) await marks.put(annotation);
  if (outcome.before.storedScore) await scores.put(outcome.before.storedScore);
  else if (outcome.engraved.length) await scores.remove(scoreKey);
}
