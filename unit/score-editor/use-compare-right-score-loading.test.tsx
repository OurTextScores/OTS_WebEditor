// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_DIFF_GUTTER_DEFAULT_WIDTH } from '../../components/score-editor/ai-constants';
import {
  useCompareRightScoreLoading,
  type CompareRightScoreLoadingContext,
} from '../../components/score-editor/compare/useCompareRightScoreLoading';

const loader = vi.hoisted(() => ({ load: vi.fn(), loadWebMscore: vi.fn() }));
vi.mock('../../lib/webmscore-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/webmscore-loader')>()),
  loadWebMscore: loader.loadWebMscore,
}));

const fn = () => vi.fn();
const setterNames = [
  'setCompareRightScore',
  'setCompareRightParts',
  'setCompareRightPageCount',
  'setCompareRightLoading',
  'setCompareRightError',
  'setCompareFitZoom',
  'setCompareZoom',
  'setCompareActiveSide',
  'setPalettesOpen',
  'setPaletteCategory',
  'setCompareLeftSvgSize',
  'setCompareRightSvgSize',
  'setCompareLeftMeasurePositions',
  'setCompareRightMeasurePositions',
  'setCompareSignatures',
  'setCompareSwapped',
  'setCompareLeftCheckpointLabel',
  'setCompareRightCheckpointLabel',
  'setAiDiffReviews',
  'setAiMeasureThreads',
  'setAiFocusedMeasureAnchor',
  'setAiMeasureThreadDraft',
  'setAiDiffIteration',
  'setAiDiffGlobalComment',
  'setAiDiffFeedbackError',
  'setAiDiffBlockErrors',
  'setAiDiffGutterWidth',
] as const;

function loadedScore(over: Record<string, unknown> = {}) {
  return {
    npages: vi.fn(async () => 3),
    metadata: vi.fn(async () => ({
      parts: [{ name: 'Violin', instrumentName: 'Violin', instrumentId: 'v', isVisible: 'true' }],
    })),
    destroy: vi.fn(),
    ...over,
  };
}

function setup(over: Partial<Record<keyof CompareRightScoreLoadingContext, unknown>> = {}) {
  const ctx: Record<string, unknown> = {
    compareView: { checkpointXml: '<score/>' },
    invalidateCompareOperations: fn(),
    stopCompareSideAudio: vi.fn(async () => undefined),
    compareRightScoreRef: { current: null },
    queueCompareScoreTeardown: vi.fn(async () => undefined),
    scoreRef: { current: { id: 'live' } },
    compareLoadedCheckpointXmlRef: { current: null },
    resetCompareEditing: fn(),
    resetCompareEditingRole: fn(),
    aiDiffFeedbackBusy: false,
    clearAiProposal: fn(),
    runSerializedScoreOperation: vi.fn(async (operation: () => Promise<unknown>) => operation()),
    ...over,
  };
  for (const name of setterNames) if (!(name in ctx)) ctx[name] = fn();
  const hook = renderHook(
    (props: typeof ctx) =>
      useCompareRightScoreLoading(props as unknown as CompareRightScoreLoadingContext),
    {
      initialProps: ctx,
    },
  );
  return { ctx: ctx as Record<string, ReturnType<typeof vi.fn> & { current?: unknown }>, ...hook };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  loader.load.mockReset();
  loader.loadWebMscore.mockReset();
  loader.loadWebMscore.mockResolvedValue({ load: loader.load });
});

describe('closing compare', () => {
  it('stops the audio, releases the right score and puts every piece of compare state back', () => {
    const aux = { id: 'aux' };
    const { ctx } = setup({ compareView: null, compareRightScoreRef: { current: aux } });
    expect(ctx.invalidateCompareOperations).toHaveBeenCalled();
    expect(ctx.stopCompareSideAudio).toHaveBeenCalledWith('left', { awaitCancel: true });
    expect(ctx.stopCompareSideAudio).toHaveBeenCalledWith('right', { awaitCancel: true });
    expect(ctx.queueCompareScoreTeardown).toHaveBeenCalledWith(
      aux,
      { id: 'live' },
      'compare-close',
    );
    expect(
      (ctx.compareLoadedCheckpointXmlRef as unknown as { current: unknown }).current,
    ).toBeNull();
    expect(ctx.setCompareRightScore).toHaveBeenCalledWith(null);
    expect(ctx.setCompareRightParts).toHaveBeenCalledWith([]);
    expect(ctx.setCompareRightPageCount).toHaveBeenCalledWith(1);
    expect(ctx.setCompareRightLoading).toHaveBeenCalledWith(false);
    expect(ctx.setCompareRightError).toHaveBeenCalledWith(null);
    expect(ctx.setCompareFitZoom).toHaveBeenCalledWith(0.5);
    expect(ctx.setCompareZoom).toHaveBeenCalledWith(null);
    expect(ctx.setCompareActiveSide).toHaveBeenCalledWith(null);
    expect(ctx.resetCompareEditing).toHaveBeenCalled();
    expect(ctx.setPalettesOpen).toHaveBeenCalledWith(false);
    expect(ctx.setPaletteCategory).toHaveBeenCalledWith(null);
    expect(ctx.setCompareSwapped).toHaveBeenCalledWith(false);
    expect(ctx.setCompareLeftCheckpointLabel).toHaveBeenCalledWith('');
    expect(ctx.setCompareRightCheckpointLabel).toHaveBeenCalledWith('');
    for (const name of [
      'setCompareLeftSvgSize',
      'setCompareRightSvgSize',
      'setCompareLeftMeasurePositions',
      'setCompareRightMeasurePositions',
      'setCompareSignatures',
    ]) {
      expect(ctx[name]).toHaveBeenCalledWith(null);
    }
  });

  it('also clears the AI review state, unless a feedback request is still running', () => {
    const idle = setup({ compareView: null });
    expect(idle.ctx.setAiDiffReviews).toHaveBeenCalledWith([]);
    expect(idle.ctx.setAiMeasureThreads).toHaveBeenCalledWith({});
    expect(idle.ctx.setAiMeasureThreadDraft).toHaveBeenCalledWith('');
    expect(idle.ctx.setAiDiffIteration).toHaveBeenCalledWith(0);
    expect(idle.ctx.setAiDiffGlobalComment).toHaveBeenCalledWith('');
    expect(idle.ctx.setAiDiffFeedbackError).toHaveBeenCalledWith(null);
    expect(idle.ctx.setAiDiffBlockErrors).toHaveBeenCalledWith({});
    expect(idle.ctx.clearAiProposal).toHaveBeenCalled();
    expect(idle.ctx.setAiDiffGutterWidth).toHaveBeenCalledWith(AI_DIFF_GUTTER_DEFAULT_WIDTH);

    const busy = setup({ compareView: null, aiDiffFeedbackBusy: true });
    expect(busy.ctx.setAiDiffReviews).not.toHaveBeenCalled();
    expect(busy.ctx.clearAiProposal).not.toHaveBeenCalled();
  });
});

describe('opening compare', () => {
  it('loads the checkpoint into a score and shows its page count and parts', async () => {
    const score = loadedScore();
    loader.load.mockResolvedValue(score);
    const { ctx } = setup();
    await waitFor(() => expect(ctx.setCompareRightParts).toHaveBeenCalled());
    expect(loader.load).toHaveBeenCalledWith('musicxml', expect.anything());
    expect((ctx.compareRightScoreRef as unknown as { current: unknown }).current).toBe(score);
    expect((ctx.compareLoadedCheckpointXmlRef as unknown as { current: unknown }).current).toBe(
      '<score/>',
    );
    expect(ctx.setCompareRightScore).toHaveBeenLastCalledWith(score);
    expect(ctx.setCompareRightPageCount).toHaveBeenCalledWith(3);
    expect(ctx.setCompareRightParts).toHaveBeenCalledWith([
      { index: 0, name: 'Violin', instrumentName: 'Violin', instrumentId: 'v', isVisible: true },
    ]);
    expect(ctx.runSerializedScoreOperation).toHaveBeenCalledWith(
      expect.any(Function),
      'npages(compare)',
    );
    expect(ctx.runSerializedScoreOperation).toHaveBeenCalledWith(
      expect.any(Function),
      'metadata(compare)',
    );
    expect(ctx.setCompareRightLoading.mock.calls).toEqual([[true], [false]]);
    expect(ctx.resetCompareEditingRole).toHaveBeenCalledWith('proposal');
  });

  it('replaces the old right score first: audio stopped, old score torn down', async () => {
    loader.load.mockResolvedValue(loadedScore());
    const old = { id: 'old' };
    const { ctx } = setup({ compareRightScoreRef: { current: old } });
    await waitFor(() => expect(ctx.setCompareRightParts).toHaveBeenCalled());
    expect(ctx.queueCompareScoreTeardown).toHaveBeenCalledWith(
      old,
      null,
      'compare-checkpoint-reload',
    );
    expect(ctx.stopCompareSideAudio).toHaveBeenCalledWith('left', { awaitCancel: true });
  });

  it('does not reload when the checkpoint XML is the one already loaded', () => {
    const { ctx } = setup({ compareLoadedCheckpointXmlRef: { current: '<score/>' } });
    expect(loader.loadWebMscore).not.toHaveBeenCalled();
    expect(ctx.invalidateCompareOperations).not.toHaveBeenCalled();
  });

  it('reloads when the checkpoint XML changes', async () => {
    loader.load.mockResolvedValue(loadedScore());
    const { ctx, rerender } = setup();
    await waitFor(() => expect(ctx.setCompareRightParts).toHaveBeenCalledTimes(1));
    rerender({ ...ctx, compareView: { checkpointXml: '<other/>' } } as never);
    await waitFor(() => expect(loader.load).toHaveBeenCalledTimes(2));
  });

  it('shows an error when the checkpoint cannot be loaded, and stops loading', async () => {
    loader.load.mockRejectedValue(new Error('bad xml'));
    const { ctx } = setup();
    await waitFor(() =>
      expect(ctx.setCompareRightError).toHaveBeenCalledWith('Unable to load checkpoint score.'),
    );
    expect(ctx.setCompareRightLoading).toHaveBeenLastCalledWith(false);
  });

  it('destroys a score that finishes loading after compare was closed', async () => {
    const score = loadedScore();
    let finish: (value: unknown) => void = () => {};
    loader.load.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { ctx, rerender } = setup();
    await waitFor(() => expect(loader.load).toHaveBeenCalled());
    rerender({ ...ctx, compareView: null } as never);
    finish(score);
    await waitFor(() => expect(score.destroy).toHaveBeenCalled());
    expect(ctx.setCompareRightParts).not.toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Violin' }),
    ]);
    expect((ctx.compareRightScoreRef as unknown as { current: unknown }).current).toBeNull();
  });

  it('skips the page count when the engine has no page API, and keeps at least one page', async () => {
    loader.load.mockResolvedValue(loadedScore({ npages: undefined }));
    const without = setup();
    await waitFor(() => expect(without.ctx.setCompareRightParts).toHaveBeenCalled());
    expect(without.ctx.setCompareRightPageCount).not.toHaveBeenCalled();

    loader.load.mockResolvedValue(loadedScore({ npages: vi.fn(async () => 0) }));
    const empty = setup();
    await waitFor(() => expect(empty.ctx.setCompareRightPageCount).toHaveBeenCalledWith(1));
  });
});

describe('unmounting the editor', () => {
  it('stops the audio and releases the scores that are current at that moment', async () => {
    loader.load.mockResolvedValue(loadedScore());
    const { ctx, unmount } = setup({ compareLoadedCheckpointXmlRef: { current: '<score/>' } });
    (ctx.compareRightScoreRef as unknown as { current: unknown }).current = { id: 'later-aux' };
    (ctx.scoreRef as unknown as { current: unknown }).current = { id: 'later-live' };
    ctx.queueCompareScoreTeardown.mockClear();
    ctx.stopCompareSideAudio.mockClear();
    unmount();
    expect(ctx.stopCompareSideAudio).toHaveBeenCalledWith('left', { awaitCancel: true });
    expect(ctx.stopCompareSideAudio).toHaveBeenCalledWith('right', { awaitCancel: true });
    expect(ctx.queueCompareScoreTeardown).toHaveBeenCalledWith(
      { id: 'later-aux' },
      { id: 'later-live' },
      'score-editor-unmount',
    );
  });
});
