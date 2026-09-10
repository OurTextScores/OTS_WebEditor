/**
 * Maps compare load/error state onto the pane that actually displays it.
 *
 * Same two coordinate systems as `compare-reflow-plan.ts`, and the same trap. The
 * load state — `compareRightLoading`, `compareRightError`, `compareRightScore` — is
 * **score**-oriented: it belongs to the auxiliary (checkpoint / proposal / external)
 * score, whatever pane that score happens to be drawn in. The viewport status it
 * feeds is **pane**-oriented.
 *
 * Those coincide only when the live score is in the left pane, which is the AI
 * compare orientation. Checkpoint compare, revision compare and embed external
 * compare put the auxiliary score on the left, so reading the auxiliary's state
 * straight into the right pane overlays the wrong half of the workspace: the pane
 * rendering the live score is covered by "Loading checkpoint score…" while the pane
 * that is genuinely empty says nothing.
 *
 * Pure and React-free so the mapping is proven by fixtures rather than by a render.
 */
export type ComparePaneStatus = null | {
  message: string;
  overlay: boolean;
};

export type ComparePaneStatusInput = {
  /** True when the live editor score is displayed in the left pane. */
  liveIsLeftPane: boolean;
  /** Whether the live editor score exists yet. */
  liveScorePresent: boolean;
  /** Whether the auxiliary score has finished loading into a `Score` instance. */
  auxiliaryScorePresent: boolean;
  /** Auxiliary load in flight. */
  auxiliaryLoading: boolean;
  /** Auxiliary load failure message, if any. */
  auxiliaryError: string | null;
};

export const COMPARE_LIVE_PANE_EMPTY_MESSAGE = 'Load a score to compare.';
export const COMPARE_AUXILIARY_PANE_LOADING_MESSAGE = 'Loading checkpoint score...';
export const COMPARE_AUXILIARY_PANE_EMPTY_MESSAGE = 'Score not loaded.';

export function resolveComparePaneStatus({
  liveIsLeftPane,
  liveScorePresent,
  auxiliaryScorePresent,
  auxiliaryLoading,
  auxiliaryError,
}: ComparePaneStatusInput): { left: ComparePaneStatus; right: ComparePaneStatus } {
  const live: ComparePaneStatus = liveScorePresent
    ? null
    : { message: COMPARE_LIVE_PANE_EMPTY_MESSAGE, overlay: false };

  // Error before loading, matching the original precedence: a failed load leaves the
  // message set and the loading flag cleared, but a retry can set both.
  const auxiliary: ComparePaneStatus = auxiliaryError
    ? { message: auxiliaryError, overlay: true }
    : auxiliaryLoading
      ? { message: COMPARE_AUXILIARY_PANE_LOADING_MESSAGE, overlay: true }
      : auxiliaryScorePresent
        ? null
        : { message: COMPARE_AUXILIARY_PANE_EMPTY_MESSAGE, overlay: true };

  return liveIsLeftPane ? { left: live, right: auxiliary } : { left: auxiliary, right: live };
}
