import { type BlockReview, type BlockReviewStatus } from './compare/compare-types';

export const getReviewStatusForFeedback = (review: BlockReview | undefined): BlockReviewStatus => {
  if (!review) {
    return 'pending';
  }
  if (review.status !== 'comment') {
    return review.status;
  }
  return review.comment.trim() ? 'comment' : 'pending';
};
