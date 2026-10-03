import type { MeasureAlignmentRow } from './compare-reflow-plan';

import { Score } from '../../../lib/webmscore-loader';

/**
 * Role and side vocabulary shared by every compare module.
 *
 * `CompareScoreRole` ('current' | 'proposal' | 'merged') is score identity and
 * owns editing state. `CompareSide` ('left' | 'middle' | 'right') is visual
 * position and owns DOM refs and scroll state only. Never derive one from the
 * other: two separate defects have already come from a `left`-named value
 * holding live-keyed data, and a third pane makes that trap easier to fall
 * into, not harder.
 *
 * Two-pane comparators use only the first two values of each. The third exists
 * for the scanner comparator, whose merged score is a document in its own
 * right at a position of its own.
 */
export type { CompareScoreRole } from '@/lib/compare-user-edit-diff';

export type CompareSide = 'left' | 'middle' | 'right';

export type CompareTransportState = {
  isPlaying: boolean;
  isPaused: boolean;
  isBusy: boolean;
};

/**
 * Compare-workspace domain types, shared by ScoreEditor and the extracted compare
 * modules. Moved here from ScoreEditor so both sides of an extraction can name the
 * same shapes instead of re-declaring structural approximations that drift.
 */
export type CompareBlockComment = {
  comment: string;
  leftIndices: number[];
  rightIndices: number[];
};

export type ChangeReviewDetail = {
  reviewId: string;
  viewerUserId: string;
  workId: string;
  sourceId: string;
  status: 'draft' | 'open' | 'closed' | 'withdrawn';
  permissions: {
    canRead: boolean;
    canEditDraft: boolean;
    canAddThread: boolean;
    canSubmit: boolean;
    canClose: boolean;
    canWithdraw: boolean;
    canReply: boolean;
    canResolve: boolean;
  };
};

export type ChangeReviewComment = {
  commentId: string;
  userId: string;
  username?: string;
  content: string;
  createdAt: string;
  editedAt?: string;
};

export type ChangeReviewThread = {
  threadId: string;
  status: 'open' | 'resolved';
  diffAnchor: {
    anchorId: string;
    lineText: string;
  };
  comments: ChangeReviewComment[];
};

export type ChangeReviewScoreRegion = {
  anchorId: string;
  partId: string;
  partIndex: number;
  partName?: string;
  side: 'base' | 'head';
  changeType: 'added' | 'removed' | 'modified';
  baseMeasureIndex?: number;
  headMeasureIndex?: number;
  baseMeasureNumber?: string;
  headMeasureNumber?: string;
  label: string;
  summary: string;
  commentable: boolean;
  regionHash: string;
};

export type ChangeReviewDiff = {
  reviewId: string;
  fileKind: 'canonical';
  patchsetNumber?: number;
  baseRevisionId: string;
  headRevisionId: string;
  scoreRegions: ChangeReviewScoreRegion[];
  bars: ChangeReviewBar[];
  hunks: Array<{
    hunkId: string;
    header: string;
    lines: Array<{
      anchorId: string;
      type: 'context' | 'add' | 'del';
      oldLineNumber?: number;
      newLineNumber?: number;
      content: string;
      commentable: boolean;
      lineHash: string;
      hunkHeader: string;
    }>;
  }>;
  threads: ChangeReviewThread[];
};

export type ChangeReviewBar = {
  kind: 'score_bar';
  anchorId: string;
  patchsetNumber?: number;
  revisionId: string;
  side: 'base' | 'head';
  partId: string;
  partIndex: number;
  partName?: string;
  measureIndex: number;
  measureNumber: string;
  measureHash: string;
  label: string;
  changeAnchorId?: string;
  changeType?: 'added' | 'modified';
  summary?: string;
  threadAnchorId?: string;
  hasThread?: boolean;
  commentable: boolean;
};

export type ChangeReviewScoreView = {
  reviewId: string;
  patchsetNumber?: number;
  baseRevisionId: string;
  headRevisionId: string;
  bars: ChangeReviewBar[];
  removedRegions: ChangeReviewScoreRegion[];
  threads: ChangeReviewThread[];
};

export type BlockReviewStatus = 'pending' | 'accepted' | 'rejected' | 'comment';

export type BlockReview = {
  partIndex: number;
  blockIndex: number;
  blockKey: string;
  measureRange: string;
  // Ties the review to the measure content it was made against, so a regenerated
  // proposal with a different change in the same measures cannot inherit the decision.
  contentSignature?: string;
  status: BlockReviewStatus;
  comment: string;
  commentCommitted: boolean;
};

export type AiDiffBlockRef = Pick<
  BlockReview,
  'partIndex' | 'blockIndex' | 'blockKey' | 'measureRange' | 'contentSignature'
>;

export type CompareViewState = {
  title: string;
  currentXml: string;
  checkpointXml: string;
  currentLabel?: string;
  checkpointLabel?: string;
};

export type PartAlignment = {
  partIndex: number;
  rows: MeasureAlignmentRow[];
  strategy: 'index' | 'lcs';
  lcsRatio: number;
  leftCount: number;
  rightCount: number;
};

export type CompareAppliedSpacer = {
  score: Score;
  measureIndex: number;
  staffIndex: number;
};
