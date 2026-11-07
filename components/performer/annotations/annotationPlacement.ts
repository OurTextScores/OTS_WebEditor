import { showsAt, type Annotation } from './annotationModel';
import { fromSpaces, placeAnchor, type PageGeometry, type Placement } from './pageGeometry';

/** One annotation drawn once on the page: where (its anchor's placement) and, in Play-through, at which occurrence. */
export interface DrawnAnnotation {
  readonly annotation: Annotation;
  readonly placement: Placement;
  /** The Play-through occurrence (index into the playing order), or null in the written view. */
  readonly occurrence: number | null;
}

/**
 * The annotations to draw on `page`: in the written view each at its bar; in the Play-through view (`playedBars`
 * given: bar i of the view is written bar playedBars[i]) at every occurrence of its bar it shows at.
 */
export function drawnOnPage(
  annotations: readonly Annotation[],
  geometry: PageGeometry,
  page: number,
  playedBars: readonly number[] | null,
): DrawnAnnotation[] {
  const drawn: DrawnAnnotation[] = [];
  for (const annotation of annotations) {
    if (!playedBars) {
      if (!showsAt(annotation, null)) continue;
      const placement = placeAnchor(geometry, annotation.anchor);
      if (placement?.page === page) drawn.push({ annotation, placement, occurrence: null });
      continue;
    }
    playedBars.forEach((written, occurrence) => {
      if (written !== annotation.anchor.bar || !showsAt(annotation, occurrence)) return;
      const placement = placeAnchor(geometry, annotation.anchor, occurrence);
      if (placement?.page === page) drawn.push({ annotation, placement, occurrence });
    });
  }
  return drawn;
}

/** An ink annotation's path in page units. */
export function inkPath(drawn: DrawnAnnotation): string {
  return drawn.annotation.points
    .map(([dx, dy], index) => {
      const [x, y] = fromSpaces(drawn.placement, dx, dy);
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Whether a page point is on a drawn annotation (within `tolerance` staff spaces), for the eraser. */
export function hits(drawn: DrawnAnnotation, x: number, y: number, tolerance = 1): boolean {
  const reach = tolerance * drawn.placement.space;
  return drawn.annotation.points.some(([dx, dy]) => {
    const [px, py] = fromSpaces(drawn.placement, dx, dy);
    const pad = drawn.annotation.kind === 'ink' ? reach : reach * 2;
    return Math.abs(px - x) <= pad && Math.abs(py - y) <= pad;
  });
}

/** At how many Play-through occurrences an annotation shows (its bar's plays, less those it is hidden at). */
export function occurrencesShown(annotation: Annotation, playedBars: readonly number[]): number {
  let count = 0;
  playedBars.forEach((written, occurrence) => {
    if (written === annotation.anchor.bar && showsAt(annotation, occurrence)) count += 1;
  });
  return count;
}

/** The annotation hidden at one Play-through occurrence ("only this one" erased); it stays at the others. */
export function hiddenAtOccurrence(annotation: Annotation, occurrence: number): Annotation {
  return {
    ...annotation,
    hiddenAt: [...new Set([...(annotation.hiddenAt ?? []), occurrence])].sort((a, b) => a - b),
  };
}

/**
 * The annotations that cannot be placed in this layout (their bar or part is no longer in the score, e.g. after the
 * score changed): listed in a tray instead of lost.
 */
export function unplacedOf(
  annotations: readonly Annotation[],
  geometry: PageGeometry,
  playedBars: readonly number[] | null,
): Annotation[] {
  return annotations.filter((annotation) => {
    if (annotation.engravedIn) return false; // engraved: nothing to place
    if (!playedBars) return showsAt(annotation, null) && !placeAnchor(geometry, annotation.anchor);
    return !playedBars.some(
      (written, occurrence) =>
        written === annotation.anchor.bar &&
        placeAnchor(geometry, annotation.anchor, occurrence) !== null,
    );
  });
}
