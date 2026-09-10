import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ChangeReviewScorePanel,
  type ChangeReviewScorePanelProps,
} from '../components/score-editor/ChangeReviewScorePanel';
import type {
  ChangeReviewBar,
  ChangeReviewDetail,
} from '../components/score-editor/compare/compare-types';

const bar = (anchorId: string, measureIndex: number): ChangeReviewBar => ({
  kind: 'score_bar',
  anchorId,
  revisionId: 'rev-head',
  side: 'head',
  partId: 'P1',
  partIndex: 0,
  measureIndex,
  measureNumber: String(measureIndex + 1),
  measureHash: `hash-${anchorId}`,
  label: `Measure ${measureIndex + 1}`,
  commentable: true,
});

const detail = (canAddThread: boolean): ChangeReviewDetail => ({
  reviewId: 'review-1',
  viewerUserId: 'user-1',
  workId: 'work-1',
  sourceId: 'source-1',
  status: 'open',
  permissions: {
    canRead: true,
    canEditDraft: true,
    canAddThread,
    canSubmit: true,
    canClose: true,
    canWithdraw: true,
    canReply: true,
    canResolve: true,
  },
});

const makeReview = (overrides: Partial<ChangeReviewScorePanelProps['review']> = {}) => ({
  detail: detail(true),
  barBoxes: [
    { bar: bar('anchor-1', 0), top: 40 },
    { bar: bar('anchor-2', 3), top: 220 },
  ],
  threadsByAnchor: new Map(),
  focusedAnchorId: null as string | null,
  newThreadAnchorId: null as string | null,
  newThreadContent: '',
  loading: false,
  error: null as string | null,
  actionBusy: false,
  actionError: null as string | null,
  measurePositions: null,
  scoreView: null,
  renderThread: () => null,
  createThread: vi.fn(async () => {}),
  setFocusedAnchorId: vi.fn(),
  setNewThreadAnchorId: vi.fn(),
  setNewThreadContent: vi.fn(),
  ...overrides,
});

const props = (
  review: ReturnType<typeof makeReview> = makeReview(),
): ChangeReviewScorePanelProps => ({
  review,
  gutterRef: createRef<HTMLDivElement>(),
  reviewLabel: 'Rev #7',
  zoom: 1,
});

describe('ChangeReviewScorePanel', () => {
  it('names the reviewed revision', () => {
    render(<ChangeReviewScorePanel {...props()} />);

    expect(screen.getByText('Rev #7')).toBeVisible();
  });

  it('places each bar at its own scaled offset', () => {
    // top is an engraving coordinate; the panel scales it by the current zoom and
    // adds the header offset. Two bars at different offsets must not collapse.
    render(<ChangeReviewScorePanel {...{ ...props(), zoom: 2 }} />);
    const [first, second] = screen
      .getAllByText(/^Measure/)
      .map((node) => node.closest('div[style]'));

    expect(first).toHaveStyle({ top: `${64 + 40 * 2}px` });
    expect(second).toHaveStyle({ top: `${64 + 220 * 2}px` });
  });

  it('focuses the bar that was clicked', () => {
    const review = makeReview();

    render(<ChangeReviewScorePanel {...props(review)} />);
    fireEvent.click(screen.getByText('Measure 4'));

    expect(review.setFocusedAnchorId).toHaveBeenCalledWith('anchor-2');
  });

  it('asks the owner to create the thread, and issues no request itself', () => {
    // The same boundary CompareDiffGutter was given: this panel had the endpoint
    // inline before the extraction.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const review = makeReview({
      focusedAnchorId: 'anchor-1',
      newThreadAnchorId: 'anchor-1',
      newThreadContent: 'wrong accidental here',
    });

    render(<ChangeReviewScorePanel {...props(review)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(review.createThread).toHaveBeenCalledWith('anchor-1', 'wrong accidental here');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('will not submit an empty comment', () => {
    const review = makeReview({
      focusedAnchorId: 'anchor-1',
      newThreadAnchorId: 'anchor-1',
      newThreadContent: '   ',
    });

    render(<ChangeReviewScorePanel {...props(review)} />);

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(review.createThread).not.toHaveBeenCalled();
  });

  it('offers no thread composer without permission', () => {
    const review = makeReview({
      detail: detail(false),
      focusedAnchorId: 'anchor-1',
      newThreadAnchorId: 'anchor-1',
    });

    render(<ChangeReviewScorePanel {...props(review)} />);

    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Thread' })).toBeNull();
  });

  it('reports load and action failures', () => {
    const { rerender } = render(
      <ChangeReviewScorePanel
        {...props(
          makeReview({
            error: 'review unavailable',
          }),
        )}
      />,
    );
    expect(screen.getByText('review unavailable')).toBeVisible();

    rerender(
      <ChangeReviewScorePanel
        {...props(
          makeReview({
            actionError: 'thread rejected',
          }),
        )}
      />,
    );
    expect(screen.getByText('thread rejected')).toBeVisible();
  });

  it('shows a loading note while the review is fetched', () => {
    render(<ChangeReviewScorePanel {...props(makeReview({ loading: true }))} />);

    expect(screen.getByText('Loading review...')).toBeVisible();
  });
});
