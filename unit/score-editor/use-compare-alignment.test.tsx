// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCompareAlignment,
  type CompareAlignmentContext,
} from '../../components/score-editor/compare/useCompareAlignment';
import type { Score } from '../../lib/webmscore-loader';

const note = (step: string) => `<note><pitch><step>${step}</step></pitch></note>`;
const xml = (...measures: string[]) =>
  `<score-partwise><part id="P1">${measures.map((m, i) => `<measure number="${i + 1}">${note(m)}</measure>`).join('')}</part></score-partwise>`;

function setup(over: Partial<Record<keyof CompareAlignmentContext, unknown>> = {}) {
  const ctx = {
    compareView: { checkpointXml: '<x/>' },
    isSuppliedRegionsMode: false,
    setCompareAlignments: vi.fn(),
    setCompareAlignmentLoading: vi.fn(),
    setCompareSignatures: vi.fn(),
    compareLeftXml: xml('C', 'D', 'E'),
    compareRightXml: xml('C', 'D', 'F'),
    compareLeftScore: null,
    compareRightScoreDisplay: null,
    compareLeftParts: [],
    compareRightPartsDisplay: [],
    compareAlignmentRevision: 0,
  };
  Object.assign(ctx, over);
  const hook = renderHook(
    (props: typeof ctx) => useCompareAlignment(props as unknown as CompareAlignmentContext),
    {
      initialProps: ctx,
    },
  );
  return { ctx, ...hook };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useCompareAlignment', () => {
  it('clears everything when compare is closed, and when the caller supplied the differences', () => {
    for (const over of [{ compareView: null }, { isSuppliedRegionsMode: true }]) {
      const { ctx } = setup(over);
      expect(ctx.setCompareAlignments).toHaveBeenCalledWith([]);
      expect(ctx.setCompareAlignmentLoading).toHaveBeenCalledWith(false);
      expect(ctx.setCompareSignatures).toHaveBeenCalledWith(null);
    }
  });

  it('aligns the measures of the two sides from their XML, matching the common ones', async () => {
    const { ctx } = setup();
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(1));
    const [alignments] = ctx.setCompareAlignments.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(alignments).toHaveLength(1);
    expect(alignments[0]).toMatchObject({
      partIndex: 0,
      strategy: 'lcs',
      leftCount: 3,
      rightCount: 3,
    });
    const rows = alignments[0].rows as Array<{ match: boolean }>;
    expect(rows.filter((row) => row.match)).toHaveLength(2);
    const [signatures] = ctx.setCompareSignatures.mock.calls[0] as [
      { left: string[][]; right: string[][] },
    ];
    expect(signatures.left[0]).toHaveLength(3);
    expect(signatures.right[0]).toHaveLength(3);
    expect(ctx.setCompareAlignmentLoading.mock.calls).toEqual([[true], [false]]);
  });

  it('falls back to an index alignment when no measure matches', async () => {
    const { ctx } = setup({ compareLeftXml: xml('C', 'D'), compareRightXml: xml('E', 'F') });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(1));
    const [alignments] = ctx.setCompareAlignments.mock.calls[0] as [
      Array<{ strategy: string; rows: unknown[] }>,
    ];
    expect(alignments[0].strategy).toBe('index');
    expect(alignments[0].rows).toHaveLength(2);
  });

  it('aligns a part that exists on one side only', async () => {
    const { ctx } = setup({ compareLeftXml: xml('C', 'D'), compareRightXml: xml() });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(1));
    const [alignments] = ctx.setCompareAlignments.mock.calls[0] as [
      Array<{ leftCount: number; rightCount: number; rows: unknown[] }>,
    ];
    expect(alignments[0]).toMatchObject({ leftCount: 2, rightCount: 0 });
    expect(alignments[0].rows.length).toBe(2);
  });

  it('reports an empty part when both sides have no measures', async () => {
    const { ctx } = setup({ compareLeftXml: xml(), compareRightXml: xml() });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(1));
    expect(ctx.setCompareAlignments.mock.calls[0][0]).toEqual([
      { partIndex: 0, rows: [], strategy: 'index', lcsRatio: 0, leftCount: 0, rightCount: 0 },
    ]);
  });

  it('reads the engine’s MSCX text when there is no XML, and fetches signatures from the engine as a last resort', async () => {
    const mscx = (steps: string[]) =>
      new TextEncoder().encode(
        `<museScore><Score><Staff id="1">${steps.map((s) => `<Measure><voice><Chord><Note><pitch>${s}</pitch></Note></Chord></voice></Measure>`).join('')}</Staff></Score></museScore>`,
      );
    const scoreWith = (bytes: Uint8Array) =>
      ({ saveMsc: vi.fn(async () => bytes) }) as unknown as Score;
    const { ctx } = setup({
      compareLeftXml: '',
      compareRightXml: '',
      compareLeftScore: scoreWith(mscx(['60', '62'])),
      compareRightScoreDisplay: scoreWith(mscx(['60', '64'])),
    });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalled());
    expect(ctx.setCompareAlignmentLoading).toHaveBeenCalledWith(true);
  });

  it('shows no alignment and no signatures when there are no scores either', async () => {
    const { ctx } = setup({ compareLeftXml: '', compareRightXml: '' });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledWith([]));
    expect(ctx.setCompareSignatures).toHaveBeenCalledWith(null);
  });

  it('clears the alignment when the XML cannot be parsed and no engine fallback exists', async () => {
    const { ctx } = setup({ compareLeftXml: '<broken', compareRightXml: '<also' });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledWith([]));
  });

  it('ignores a result that arrives after the inputs changed', async () => {
    let release: (bytes: Uint8Array) => void = () => {};
    const pending = new Promise<Uint8Array>((resolve) => (release = resolve));
    const slow = { saveMsc: vi.fn(() => pending) } as unknown as Score;
    const { ctx, rerender } = setup({
      compareLeftXml: '',
      compareRightXml: '',
      compareLeftScore: slow,
      compareRightScoreDisplay: slow,
    });
    await waitFor(() => expect(ctx.setCompareAlignmentLoading).toHaveBeenCalledWith(true));
    rerender({ ...ctx, compareView: null as never });
    release(
      Uint8Array.from(
        '<museScore><Score><Staff id="1"><Measure/></Staff></Score></museScore>',
        (c) => c.charCodeAt(0),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const nonEmpty = ctx.setCompareAlignments.mock.calls.filter(
      ([value]) => Array.isArray(value) && value.length > 0,
    );
    expect(nonEmpty).toHaveLength(0);
  });

  it('recomputes when the revision changes', async () => {
    const { ctx, rerender } = setup();
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(1));
    rerender({ ...ctx, compareAlignmentRevision: 1 });
    await waitFor(() => expect(ctx.setCompareAlignments).toHaveBeenCalledTimes(2));
  });
});
