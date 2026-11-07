import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import { showsAt } from '../../components/performer/annotations/annotationModel';
import { memoryAnnotationStore } from '../../components/performer/annotations/annotationStore';
import { proposeEngraving } from '../../components/performer/engraving/stampEngraving';
import { memoryScoreStore } from '../../components/performer/platform/scoreStore';
import {
  engraveMarks,
  restoreBeforeEngraving,
} from '../../components/score-editor/marks-review/engraveMarks';
import {
  reviewItemsOf,
  type ReviewDecision,
} from '../../components/score-editor/marks-review/reviewItems';

const stamp = (id: string, content: string, extra: Partial<Annotation> = {}): Annotation => ({
  id,
  scoreKey: 'local:s',
  scorePart: -1,
  kind: 'stamp',
  anchor: { bar: 1, part: 0, tick: 240 },
  points: [[0, -2, 1]],
  style: { color: 'black', width: 0, opacity: 1 },
  content,
  createdAt: 0,
  ...extra,
});

describe('stamps to engraving', () => {
  it('engraves stamps by rule and keeps reminders and handwriting as marks', () => {
    expect(proposeEngraving(stamp('a', 'dynamicMF')).engrave).toEqual({
      kind: 'dynamic',
      subtype: 'mf',
      staff: 0,
      bar: 1,
      tick: 240,
      y: -2,
    });
    expect(proposeEngraving(stamp('b', 'fingering3')).engrave?.subtype).toBe('3');
    expect(proposeEngraving(stamp('c', 'stringsUpBow')).engrave?.kind).toBe('articulation');
    expect(proposeEngraving(stamp('d', 'breathMarkComma')).engrave?.kind).toBe('breath');
    expect(proposeEngraving(stamp('e', 'accidentalSharp')).engrave?.kind).toBe('accidental');
    expect(proposeEngraving(stamp('f', 'watch'))).toMatchObject({
      engrave: null,
      reason: 'reminder',
    });
    expect(proposeEngraving(stamp('g', 'arrowBlackRight'))).toMatchObject({
      engrave: null,
      reason: 'reminder',
    });
    expect(proposeEngraving({ ...stamp('h', ''), kind: 'ink' })).toMatchObject({
      engrave: null,
      reason: 'needs-interpretation',
    });
  });

  it('hides an engraved mark: the notation shows instead', () => {
    expect(showsAt(stamp('a', 'dynamicMF', { engravedIn: 'v1' }), null)).toBe(false);
    expect(
      reviewItemsOf([stamp('a', 'dynamicMF', { engravedIn: 'v1' }), stamp('b', 'dynamicPiano')]),
    ).toHaveLength(1);
  });
});

describe('engraving the reviewed marks', () => {
  it('engraves the accepted, keeps the declined, deletes the deleted, and updates the performer copy; undo restores', async () => {
    const annotations = [
      stamp('mf', 'dynamicMF'),
      stamp('f3', 'fingering3'),
      stamp('w', 'watch'),
      stamp('p', 'dynamicPiano'),
    ];
    const marks = memoryAnnotationStore(annotations);
    const scores = memoryScoreStore();
    const addElementsAt = vi.fn(async (list: unknown[]) =>
      list.map((_, index) =>
        index === 1 ? { ok: false, reason: 'no note at that beat' } : { ok: true },
      ),
    );
    const score = {
      addElementsAt,
      // Two bars, A and B; bar 1 starts at tick 1920
      measureSignatures: vi.fn(async (part: number) => (part === 0 ? ['A', 'B'] : [])),
      measurePositions: vi.fn(async () => ({
        elements: [
          { id: 0, writtenTick: 0 },
          { id: 1, writtenTick: 1920 },
        ],
      })),
      setExcerptId: vi.fn(),
      saveMsc: vi.fn(async () => new Uint8Array([1, 2])),
    };
    const core = {
      score,
      performMutation: async (_label: string, action?: () => unknown) => {
        await action?.();
      },
      runSerializedScoreOperation: <T>(operation: () => Promise<T>) => operation(),
    } as never;
    const items = reviewItemsOf(annotations);
    const decisions = new Map<string, ReviewDecision>([
      ['mf', 'engrave'],
      ['f3', 'engrave'],
      ['w', 'keep'],
      ['p', 'delete'],
    ]);
    const outcome = (await engraveMarks({
      core,
      scoreKey: 'local:s',
      items,
      decisions,
      marks,
      scores,
    }))!;
    expect(addElementsAt).toHaveBeenCalledTimes(1);
    // Absolute ticks: bar 1's start plus the beat
    expect(addElementsAt.mock.calls[0][0]).toEqual([
      { kind: 'dynamic', subtype: 'mf', staff: 0, tick: 2160, y: -2 },
      { kind: 'fingering', subtype: '3', staff: 0, tick: 2160, y: -2 },
    ]);
    expect(outcome.engraved.map((a) => a.id)).toEqual(['mf']);
    expect(outcome.declined).toEqual([
      { annotation: annotations[1], reason: 'no note at that beat' },
    ]);
    expect(outcome.deleted.map((a) => a.id)).toEqual(['p']);
    const after = await marks.list('local:s');
    expect(after.find((a) => a.id === 'mf')?.engravedIn).toBeTruthy();
    expect(after.find((a) => a.id === 'f3')?.engravedIn).toBeUndefined();
    expect(after.some((a) => a.id === 'p')).toBe(false);
    expect(after.find((a) => a.id === 'w')?.reviewedAt).toBeTruthy(); // kept: reviewed, not offered again
    expect((await scores.get('local:s'))?.bytes).toEqual(new Uint8Array([1, 2]));

    await restoreBeforeEngraving(outcome, marks, scores, 'local:s');
    expect((await marks.list('local:s')).map((a) => a.engravedIn ?? null)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(await scores.get('local:s')).toBeUndefined();
  });
});

describe('a mark whose bar has changed', () => {
  it('is not engraved: it could land on the wrong music', async () => {
    const { placeMark } = await import('../../components/score-editor/marks-review/engraveMarks');
    const { signatureAt, combineSignatures } =
      await import('../../components/performer/annotations/barSignatures');
    const madeOn = combineSignatures([['A', 'B', 'C']]);
    const now = combineSignatures([['A', 'X', 'C']]);
    const annotation = stamp('mf', 'dynamicMF', {
      anchor: { bar: 1, part: 0, tick: 240, signature: signatureAt(madeOn, 1) },
    });
    const mark = proposeEngraving(annotation).engrave!;
    expect(placeMark(mark, annotation, { signatures: now, ticks: [0, 1920, 3840] })).toMatchObject({
      reason: 'its bar has changed since the mark was made',
    });
    // Bars inserted before it: found again, its beat from the new bar's start
    const inserted = combineSignatures([['A', 'Y', 'B', 'C']]);
    expect(
      placeMark(mark, annotation, { signatures: inserted, ticks: [0, 1920, 3840, 5760] }),
    ).toMatchObject({
      engine: { tick: 3840 + 240 },
      anchor: { bar: 2 },
    });
  });
});
