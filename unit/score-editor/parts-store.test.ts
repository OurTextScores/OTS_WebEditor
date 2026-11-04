import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import { ensureFullScore, getPartsSnapshot, resetParts } from '../../components/score-editor/parts';
import { setPartsSnapshot } from '../../components/score-editor/parts/partsStore';

const run = vi.fn((operation: () => Promise<unknown>) => operation()) as never;

describe('parts store (roadmap E18)', () => {
  afterEach(() => resetParts());

  it('returns the engine to the full score before a whole-score read, from a part view', async () => {
    const setExcerptId = vi.fn();
    const score = { setExcerptId } as unknown as Score;
    setPartsSnapshot({ score, parts: [{ name: 'Violin', instruments: ['Violin'] }], current: 0 });
    await ensureFullScore(score, run);
    expect(setExcerptId).toHaveBeenCalledWith(-1);
    expect(getPartsSnapshot().current).toBe(-1);
  });

  it('does nothing on the full score, or for a score the store does not show (a compare pane)', async () => {
    const setExcerptId = vi.fn();
    const score = { setExcerptId } as unknown as Score;
    setPartsSnapshot({ score, parts: [], current: -1 });
    await ensureFullScore(score, run);
    setPartsSnapshot({ current: 0 });
    await ensureFullScore({ setExcerptId } as unknown as Score, run);
    expect(setExcerptId).not.toHaveBeenCalled();
    expect(getPartsSnapshot().current).toBe(0);
  });
});
