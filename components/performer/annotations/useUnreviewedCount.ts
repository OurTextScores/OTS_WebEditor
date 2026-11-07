import { useEffect, useState } from 'react';
import type { AnnotationStore } from './annotationStore';

/** A score's marks (every part) made since the last review: not engraved and not kept at a review (Phase 7b). */
export function useUnreviewedCount(store: AnnotationStore, scoreKey: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    void store
      .list(scoreKey)
      .then(
        (marks) =>
          live && setCount(marks.filter((mark) => !mark.engravedIn && !mark.reviewedAt).length),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [store, scoreKey]);
  return count;
}
