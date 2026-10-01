import type { OtsModeKind, OtsWorkspaceMode } from '../shell/workspaceMode';
import { buildCompareMode } from './buildCompareMode';
import { buildHistoryMode } from './buildHistoryMode';
import { buildWriteMode } from './buildWriteMode';
import { buildHostChangeReviewMode } from './host/buildHostChangeReviewMode';
import { buildHostCompareMode } from './host/buildHostCompareMode';
import { buildHostScannerFindingsMode } from './host/buildHostScannerFindingsMode';
import { buildHostScannerRowsMode } from './host/buildHostScannerRowsMode';
import type { BuildContext } from './types';

export type { BuildContext, CompareRenderOptions, CompareVariant, ModeNodes } from './types';

const BUILDERS: Record<OtsModeKind, (context: BuildContext) => OtsWorkspaceMode> = {
  write: buildWriteMode,
  compare: buildCompareMode,
  history: buildHistoryMode,
  'host-compare': buildHostCompareMode,
  'host-change-review': buildHostChangeReviewMode,
  'host-scanner-rows': buildHostScannerRowsMode,
  'host-scanner-findings': buildHostScannerFindingsMode,
};

/** The one place a mode kind becomes something to render. */
export function buildWorkspaceMode(kind: OtsModeKind, context: BuildContext): OtsWorkspaceMode {
  return BUILDERS[kind](context);
}
