import { describe, expect, it } from 'vitest';
import {
  COMPARE_AUXILIARY_PANE_EMPTY_MESSAGE,
  COMPARE_AUXILIARY_PANE_LOADING_MESSAGE,
  COMPARE_LIVE_PANE_EMPTY_MESSAGE,
  resolveComparePaneStatus,
  type ComparePaneStatusInput,
} from '../components/score-editor/compare/compare-pane-status';

const input = (overrides: Partial<ComparePaneStatusInput> = {}): ComparePaneStatusInput => ({
  liveIsLeftPane: true,
  liveScorePresent: true,
  auxiliaryScorePresent: true,
  auxiliaryLoading: false,
  auxiliaryError: null,
  ...overrides,
});

describe('resolveComparePaneStatus', () => {
  it('overlays the pane that shows the auxiliary score while it loads, in both orientations', () => {
    // AI compare: live on the left, auxiliary on the right.
    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: true,
          auxiliaryScorePresent: false,
          auxiliaryLoading: true,
        }),
      ),
    ).toEqual({
      left: null,
      right: { message: COMPARE_AUXILIARY_PANE_LOADING_MESSAGE, overlay: true },
    });

    // Checkpoint / revision / embed external compare: auxiliary on the left. This is
    // the case that used to overlay the right pane, which was rendering the live
    // score perfectly well.
    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: false,
          auxiliaryScorePresent: false,
          auxiliaryLoading: true,
        }),
      ),
    ).toEqual({
      left: { message: COMPARE_AUXILIARY_PANE_LOADING_MESSAGE, overlay: true },
      right: null,
    });
  });

  it('reports an auxiliary load failure on the auxiliary pane', () => {
    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: false,
          auxiliaryScorePresent: false,
          auxiliaryError: 'Unable to load checkpoint score.',
        }),
      ),
    ).toEqual({
      left: { message: 'Unable to load checkpoint score.', overlay: true },
      right: null,
    });
  });

  it('prefers the error message over the loading message when both are set', () => {
    const { right } = resolveComparePaneStatus(
      input({
        liveIsLeftPane: true,
        auxiliaryScorePresent: false,
        auxiliaryLoading: true,
        auxiliaryError: 'Unable to load checkpoint score.',
      }),
    );

    expect(right).toEqual({ message: 'Unable to load checkpoint score.', overlay: true });
  });

  it('marks an auxiliary pane with no score and no load in flight as not loaded', () => {
    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: false,
          auxiliaryScorePresent: false,
        }),
      ),
    ).toEqual({
      left: { message: COMPARE_AUXILIARY_PANE_EMPTY_MESSAGE, overlay: true },
      right: null,
    });
  });

  it('prompts on the live pane, without an overlay, when no score is loaded', () => {
    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: true,
          liveScorePresent: false,
        }),
      ),
    ).toEqual({
      left: { message: COMPARE_LIVE_PANE_EMPTY_MESSAGE, overlay: false },
      right: null,
    });

    expect(
      resolveComparePaneStatus(
        input({
          liveIsLeftPane: false,
          liveScorePresent: false,
        }),
      ),
    ).toEqual({
      left: null,
      right: { message: COMPARE_LIVE_PANE_EMPTY_MESSAGE, overlay: false },
    });
  });

  it('clears both panes once each side has its score', () => {
    expect(resolveComparePaneStatus(input())).toEqual({ left: null, right: null });
    expect(resolveComparePaneStatus(input({ liveIsLeftPane: false }))).toEqual({
      left: null,
      right: null,
    });
  });
});
