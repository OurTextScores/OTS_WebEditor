import { deviceTable, memoryTable, type Table } from '../platform/performDb';
import type { Annotation } from './annotationModel';
import type { AnnotationStore } from './annotationStore';

/**
 * A checkpoint: a score's marks (every part) as they were at a moment the performer chose ("Before the concert"), to
 * go back to. Marks are saved on the device as they are made; checkpoints are the points to return to.
 */
export interface MarksCheckpoint {
  readonly id: string;
  readonly scoreKey: string;
  readonly name: string;
  readonly createdAt: number;
  readonly annotations: readonly Annotation[];
}

export type CheckpointStore = Table<MarksCheckpoint>;

export const deviceCheckpointStore = (): CheckpointStore =>
  deviceTable<MarksCheckpoint>('checkpoints', (checkpoint) => checkpoint.id);
export const memoryCheckpointStore = (initial: MarksCheckpoint[] = []): CheckpointStore =>
  memoryTable<MarksCheckpoint>((checkpoint) => checkpoint.id, initial);

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `cp-${Date.now()}-${Math.random()}`;

/** A score's checkpoints, newest first. */
export async function checkpointsOf(
  store: CheckpointStore,
  scoreKey: string,
): Promise<MarksCheckpoint[]> {
  return (await store.where('scoreKey', scoreKey)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Saves the score's marks as they are now, under `name`. */
export async function saveCheckpoint(
  marks: AnnotationStore,
  checkpoints: CheckpointStore,
  scoreKey: string,
  name: string,
  now = Date.now(),
): Promise<MarksCheckpoint> {
  const checkpoint: MarksCheckpoint = {
    id: newId(),
    scoreKey,
    name: name.trim() || new Date(now).toLocaleString(),
    createdAt: now,
    annotations: await marks.list(scoreKey),
  };
  await checkpoints.put(checkpoint);
  return checkpoint;
}

/**
 * Puts the score's marks back as they were at `checkpoint`. The marks as they are now are kept first, as a checkpoint
 * "Before restoring …", so a restore can be undone the same way. Returns that safety checkpoint.
 */
export async function restoreCheckpoint(
  marks: AnnotationStore,
  checkpoints: CheckpointStore,
  checkpoint: MarksCheckpoint,
  now = Date.now(),
): Promise<MarksCheckpoint> {
  const safety = await saveCheckpoint(
    marks,
    checkpoints,
    checkpoint.scoreKey,
    `Before restoring “${checkpoint.name}”`,
    now,
  );
  const keep = new Set(checkpoint.annotations.map((annotation) => annotation.id));
  for (const annotation of safety.annotations) {
    if (!keep.has(annotation.id)) await marks.remove(annotation.id);
  }
  for (const annotation of checkpoint.annotations) await marks.put(annotation);
  return safety;
}
