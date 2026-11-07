import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import { memoryAnnotationStore } from '../../components/performer/annotations/annotationStore';
import {
  checkpointsOf,
  memoryCheckpointStore,
  restoreCheckpoint,
  saveCheckpoint,
} from '../../components/performer/annotations/checkpoints';

const mark = (id: string, scoreKey = 's'): Annotation => ({
  id,
  scoreKey,
  scorePart: 0,
  kind: 'stamp',
  anchor: { bar: 0, part: 0 },
  points: [[0, 0, 1]],
  style: { color: 'black', width: 0, opacity: 1 },
  content: 'dynamicMF',
  createdAt: 0,
});

describe('checkpoints of the marks', () => {
  it("saves a score's marks and puts them back, keeping the marks before as a checkpoint", async () => {
    const marks = memoryAnnotationStore([mark('a'), mark('b'), mark('other', 'elsewhere')]);
    const checkpoints = memoryCheckpointStore();
    const saved = await saveCheckpoint(marks, checkpoints, 's', 'Before the concert', 1);
    expect(saved.annotations.map((annotation) => annotation.id).sort()).toEqual(['a', 'b']);

    // Later: b erased, c added
    await marks.remove('b');
    await marks.put(mark('c'));
    const safety = await restoreCheckpoint(marks, checkpoints, saved, 2);
    expect((await marks.list('s')).map((annotation) => annotation.id).sort()).toEqual(['a', 'b']);
    expect((await marks.list('elsewhere')).length).toBe(1); // other scores untouched
    expect(safety.name).toBe('Before restoring “Before the concert”');
    expect(safety.annotations.map((annotation) => annotation.id).sort()).toEqual(['a', 'c']);
    expect((await checkpointsOf(checkpoints, 's')).map((checkpoint) => checkpoint.name)).toEqual([
      'Before restoring “Before the concert”',
      'Before the concert',
    ]);
  });
});
