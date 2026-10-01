import type React from 'react';
import type { AnyCommand } from '../../lib/commands/types';

/**
 * The mode contract the shell renders (SHELL_REDESIGN_DESIGN §7).
 *
 * Phase 0 declares the types and the pure selector (`selectWorkspaceMode`) only; nothing
 * renders an `OtsWorkspaceMode` yet. `ScoreEditor` still derives its own booleans, and
 * Phase 4 replaces those reads with `mode.interaction` and the builders.
 */
export type OtsModeKind =
  | 'write'
  | 'compare'
  | 'history'
  | 'host-compare'
  | 'host-change-review'
  | 'host-scanner-rows'
  | 'host-scanner-findings';

/** What pointer and keyboard handlers may do (replaces the isChangeReviewSingleScoreMode checks). */
export type InteractionPolicy = 'edit' | 'review' | 'readonly';

/** Screen space covered by docked panels, reported to the canvas (Viritura `canvas(insets)`). */
export interface WorkspaceInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface OtsWorkspaceMode {
  readonly kind: OtsModeKind;
  /** `none` for host-* surfaces (P6): no header, menu bar, activity bar or status bar. */
  readonly chrome: 'full' | 'none';
  readonly interaction: InteractionPolicy;
  /** Underlay; receives panel insets. */
  readonly canvas: (insets: WorkspaceInsets) => React.ReactNode;
  /** Flat array of panel elements (never a fragment). */
  readonly panels: React.ReactNode[];
  /** Content for the ToolbarPortal; omit for no mode toolbar. */
  readonly toolbar?: React.ReactNode;
  /** Status bar content; ignored when chrome === 'none'. */
  readonly statusBar?: React.ReactNode;
  /** Dialogs and overlays rendered outside the workspace shell. */
  readonly siblings?: React.ReactNode;
  /** Commands registered while this mode is active (scope 'mode'). */
  readonly commands: readonly AnyCommand[];
  readonly onTogglePanels: () => void;
}

/** The activities the user can pick between; compare is entered by state as well. */
export type OtsActivity = 'write' | 'history';
