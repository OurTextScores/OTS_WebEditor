import type { Score } from '../../../lib/webmscore-loader';

/**
 * Parts (roadmap E18): the live score's parts (MuseScore's excerpts) and which one the editor shows. A module-level store,
 * so the status bar's selector reads it without props, and so the whole-score readers can return to the full score
 * before they export (ensureFullScore).
 */
export type ScorePart = {
  name: string;
  instruments: string[];
  /** Which of the full score's instruments the part has (indices into its parts). */
  partIndices?: number[];
};

export type PartsSnapshot = {
  readonly score: Score | null;
  readonly parts: readonly ScorePart[];
  /** -1 the full score, else an index into `parts` (the engine's excerptId). */
  readonly current: number;
  /** Whether the Manage Parts dialog is open. */
  readonly managing: boolean;
};

const EMPTY: PartsSnapshot = { score: null, parts: [], current: -1, managing: false };
let snapshot: PartsSnapshot = EMPTY;
const listeners = new Set<() => void>();

export const getPartsSnapshot = (): PartsSnapshot => snapshot;

export function subscribeToParts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPartsSnapshot(next: Partial<PartsSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of [...listeners]) listener();
}

/** Back to a store with no score (tests, and a score being replaced). */
export function resetParts(): void {
  setPartsSnapshot(EMPTY);
}

type Serialized = <T>(operation: () => Promise<T>, label: string) => Promise<T>;

/**
 * Makes the engine act on the full score again, for what must read or replace the whole score: the AI tools, the
 * MusicXML panel, compare, checkpoints and an applied MusicXML edit. Reading a part there would hand them one part as if
 * it were the score, and applying their result would replace the score with that part. The editor's view follows
 * (useScoreParts re-renders when `current` changes).
 */
export async function ensureFullScore(
  score: Score | null | undefined,
  run: Serialized,
): Promise<void> {
  if (!score || snapshot.score !== score || snapshot.current === -1 || !score.setExcerptId) return;
  await run(() => Promise.resolve(score.setExcerptId!(-1)), 'setExcerptId(full score)');
  setPartsSnapshot({ current: -1 });
}

/**
 * Runs `operation` on the full score and points the engine back at the part shown, in one serialized operation, so
 * nothing is drawn in between and the view stays as it is. For what only exists for the whole project: the engine
 * refuses to save a part as MSCZ/MSCX, which is the project file with all its parts anyway.
 */
export async function withFullScore<T>(
  score: Score,
  run: Serialized,
  operation: () => Promise<T>,
): Promise<T> {
  const { current } = snapshot;
  if (snapshot.score !== score || current === -1 || !score.setExcerptId)
    return run(operation, 'full score');
  return run(async () => {
    await score.setExcerptId!(-1);
    try {
      return await operation();
    } finally {
      await score.setExcerptId!(current);
    }
  }, 'full score');
}
