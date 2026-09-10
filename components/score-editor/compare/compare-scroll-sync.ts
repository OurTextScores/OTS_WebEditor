/**
 * Keeps the two compare panes and the diff gutter scrolled together.
 *
 * The reentrancy guard is the whole substance here. Assigning `scrollTop` fires a
 * `scroll` event on the element being assigned to, whose own handler would copy the
 * position straight back — two panes taking turns nudging each other, which reads as
 * stuttering or a pane that will not stay where the user put it. The guard makes the
 * programmatic assignments invisible to the handlers they trigger.
 *
 * Pure and DOM-free so both the mapping and the guard are provable without a browser;
 * AC-29 of the editable-compare design lists synchronized scrolling as a regression
 * surface and nothing exercised it.
 */
export type ScrollPosition = {
  scrollTop: number;
  scrollLeft: number;
};

export type CompareScrollSync = (
  source: ScrollPosition,
  target: ScrollPosition,
  gutterTarget: Pick<ScrollPosition, 'scrollTop'>,
) => boolean;

/**
 * @param guard shared re-entrancy flag; a ref in React, any holder in a test
 * @returns the sync, which reports whether it ran
 */
export function createCompareScrollSync(guard: { current: boolean }): CompareScrollSync {
  return (source, target, gutterTarget) => {
    if (guard.current) {
      return false;
    }
    guard.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    // The gutter follows vertically only: it is a narrow column beside the panes and
    // has no horizontal extent to match.
    gutterTarget.scrollTop = source.scrollTop;
    guard.current = false;
    return true;
  };
}
