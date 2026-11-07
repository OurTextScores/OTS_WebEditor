import type { Annotation } from '../../performer/annotations/annotationModel';
import { proposeEngraving, type EngravingProposal } from '../../performer/engraving/stampEngraving';

/** What the reviewer decided for a mark: engrave it, keep it as a mark, or delete it. */
export type ReviewDecision = 'engrave' | 'keep' | 'delete';

export interface ReviewItem {
  readonly annotation: Annotation;
  readonly proposal: EngravingProposal;
}

/** The marks to review for a score: not yet engraved, in score order (part, bar, beat). */
export function reviewItemsOf(annotations: readonly Annotation[]): ReviewItem[] {
  return annotations
    .filter((annotation) => !annotation.engravedIn)
    .map((annotation) => ({ annotation, proposal: proposeEngraving(annotation) }))
    .sort(
      (a, b) =>
        a.annotation.scorePart - b.annotation.scorePart ||
        a.annotation.anchor.bar - b.annotation.anchor.bar ||
        (a.annotation.anchor.tick ?? 0) - (b.annotation.anchor.tick ?? 0),
    );
}

/** The starting decision: engrave what a rule can engrave, keep the rest as marks. */
export const defaultDecision = (item: ReviewItem): ReviewDecision =>
  item.proposal.engrave ? 'engrave' : 'keep';
