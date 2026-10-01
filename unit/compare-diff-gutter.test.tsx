import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CompareDiffGutter,
  type CompareDiffGutterProps,
} from '../components/score-editor/compare/CompareDiffGutter';
import type {
  ChangeReviewBar,
  ChangeReviewDetail,
} from '../components/score-editor/compare/compare-types';

/**
 * The gutter's behavior is otherwise proven only by assistant-diff-editor.spec.ts in a
 * real browser. These cases cover the boundary the extraction is responsible for: the
 * gutter states an intent and its owner performs the request.
 */
const bar = (anchorId: string): ChangeReviewBar => ({
  kind: 'score_bar',
  anchorId,
  revisionId: 'rev-1',
  side: 'base',
  partId: 'p1',
  partIndex: 0,
  measureIndex: 0,
  measureNumber: '1',
  measureHash: 'hash-1',
  label: 'Measure 1',
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

const bounds = [{ top: 0, height: 40 }];
const positions = {
  pages: [],
} as unknown as CompareDiffGutterProps['panes']['left']['measurePositions'];

const props = (
  overrides: {
    createThread?: CompareDiffGutterProps['review']['createThread'];
    newThreadContent?: string;
    canAddThread?: boolean;
  } = {},
): CompareDiffGutterProps => ({
  mode: { isAiCompareMode: false, isChangeReviewCompareMode: true, hosted: false },
  panes: {
    left: { bounds, measurePositions: positions, parts: [{ name: 'Piano' }], score: null },
    right: { bounds, measurePositions: positions, parts: [{ name: 'Piano' }], score: null },
  },
  layout: {
    partCount: 1,
    rowHeight: 40,
    trackHeight: 200,
    headerSpacerHeight: 8,
    regionRefs: createRef<
      Map<string, HTMLDivElement>
    >() as CompareDiffGutterProps['layout']['regionRefs'],
    alignmentByPart: new Map([
      [
        0,
        {
          rows: [{ leftIndex: 0, rightIndex: 0, match: true }],
          leftCount: 1,
          rightCount: 1,
        },
      ],
    ]),
    alignmentLoading: false,
    signatures: null,
  },
  diff: {
    blockContentSignature: () => 'signature',
    blockErrors: {},
    feedbackBusy: false,
    bindCommentTextarea: () => {},
    clearBlockError: () => {},
    commitBlockComment: () => {},
    editBlockComment: () => {},
    onAcceptBlock: async () => {},
    onBlockCommentInput: () => {},
    onCommentResize: () => {},
    resolveReview: () => undefined,
    setBlockStatus: () => {},
  },
  review: {
    actionBusy: false,
    barsForGutter: [bar('anchor-1')],
    detail: detail(overrides.canAddThread ?? true),
    focusedAnchorId: 'anchor-1',
    loading: false,
    newThreadAnchorId: 'anchor-1',
    newThreadContent: overrides.newThreadContent ?? 'looks wrong here',
    regionsInMeasureOrder: [],
    threadsByAnchor: new Map(),
    renderThread: () => null,
    createThread: overrides.createThread ?? vi.fn(async () => {}),
    setFocusedAnchorId: () => {},
    setNewThreadAnchorId: () => {},
    setNewThreadContent: () => {},
  },
  blocks: {
    buildMismatchBlocks: () => [],
    comments: {},
    setComments: () => {},
    focusedKey: null,
    setFocusedKey: () => {},
    editBusy: false,
    swapBusy: false,
    rightError: null,
    onOverwrite: async () => true,
  },
});

// The regionRefs prop is a live ref map in production; createRef gives it a null current,
// so seed it the way ScoreEditor does.
const withRefs = (value: CompareDiffGutterProps): CompareDiffGutterProps => {
  (value.layout.regionRefs as { current: Map<string, HTMLDivElement> }).current = new Map();
  return value;
};

describe('CompareDiffGutter change-review threads', () => {
  it('asks its owner to create the thread instead of calling the review API itself', () => {
    const createThread = vi.fn(async () => {});

    render(<CompareDiffGutter {...withRefs(props({ createThread }))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(createThread).toHaveBeenCalledTimes(1);
    expect(createThread).toHaveBeenCalledWith('anchor-1', 'looks wrong here');
  });

  it('issues no request of its own', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<CompareDiffGutter {...withRefs(props())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps Submit disabled while the draft is blank', () => {
    const createThread = vi.fn(async () => {});

    render(<CompareDiffGutter {...withRefs(props({ createThread, newThreadContent: '   ' }))} />);
    const submit = screen.getByRole('button', { name: 'Submit' });

    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(createThread).not.toHaveBeenCalled();
  });

  it('offers no thread composer without permission to add one', () => {
    render(<CompareDiffGutter {...withRefs(props({ canAddThread: false }))} />);

    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });
});
