import type { OtsActivity, OtsModeKind } from './workspaceMode';

/** The slice of `URLSearchParams` the selector reads, so tests and callers need no DOM. */
export interface WorkspaceUrlParams {
  get(name: string): string | null;
}

export interface WorkspaceModeState {
  /** `compareView !== null`: a checkpoint compare, loaded-score compare or AI proposal is open. */
  readonly compareViewActive: boolean;
  /** The user-selected activity; persisted by the caller. */
  readonly activity: OtsActivity;
}

const trimmed = (params: WorkspaceUrlParams, name: string) => params.get(name)?.trim() || '';

/**
 * Pure replacement for the mode booleans `ScoreEditor` derives from the URL
 * (`isFindingsRowsMode`, `isSystemRowsMode`, `isChangeReviewSingleScoreMode`,
 * `isCompareEmbedMode`) and from `compareView`. Which values are trimmed and which are
 * only truth-tested matches those derivations exactly, so the two cannot disagree.
 *
 * Precedence (SHELL_REDESIGN_DESIGN §7.2):
 *   1. URL host surfaces: findings rows, system rows, single-score change review, then
 *      compare embed (with or without `changeReviewId`).
 *   2. `compareView !== null` -> `compare`.
 *   3. The user-selected activity.
 */
export function selectWorkspaceMode(
  params: WorkspaceUrlParams,
  state: WorkspaceModeState,
): OtsModeKind {
  const compareLeft = params.get('compareLeft');
  const compareRight = params.get('compareRight');
  const reviewScore = params.get('reviewScore');
  const compareRegions = trimmed(params, 'compareRegions');
  const compareMode = trimmed(params, 'compareMode');
  const changeReviewId = trimmed(params, 'changeReviewId');

  const isFindings =
    Boolean(compareLeft && !compareRight && compareRegions) && compareMode === 'findings';
  const isCompareEmbed = Boolean(compareLeft && compareRight);
  // `isSuppliedRegionsMode && compareMode === 'rows' && !isFindingsRowsMode`; findings
  // requires no `compareRight` and a compare embed requires one, so the `!isFindings`
  // clause is already implied by `compareMode === 'rows'`.
  const isSystemRows = isCompareEmbed && Boolean(compareRegions) && compareMode === 'rows';
  const isChangeReviewSingle = Boolean(reviewScore && changeReviewId);

  if (isFindings) return 'host-scanner-findings';
  if (isSystemRows) return 'host-scanner-rows';
  if (isChangeReviewSingle) return 'host-change-review';
  if (isCompareEmbed) return 'host-compare';
  if (state.compareViewActive) return 'compare';
  return state.activity;
}

/** Host surfaces are chrome-less (P6): the mode, not the shell, decides. */
export function isHostMode(kind: OtsModeKind): boolean {
  return kind.startsWith('host-');
}
