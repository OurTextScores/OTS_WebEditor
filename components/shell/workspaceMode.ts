import type React from 'react';
import type { AnyCommand } from '../../lib/commands/types';

/**
 * The mode contract the shell renders (SHELL_REDESIGN_DESIGN §7).
 *
 * `selectWorkspaceMode` picks an `OtsModeKind` from the URL and editor state; a builder
 * (`components/modes/`) turns it into an `OtsWorkspaceMode`; `EditorWorkspace` renders that
 * and never looks at `kind`. Anything that varies by mode is either a trait below or a node
 * the builder chose, so adding a mode touches one builder, not dozens of call sites.
 */
export type OtsModeKind =
  | 'write'
  | 'compare'
  | 'history'
  | 'host-compare'
  | 'host-change-review'
  | 'host-scanner-rows'
  | 'host-scanner-findings';

/** What pointer and keyboard handlers may do on the score canvas. */
export type InteractionPolicy = 'edit' | 'review' | 'readonly';

/** Screen space covered by docked panels, reported to the canvas (Viritura `canvas(insets)`). */
export interface WorkspaceInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The activities the user can pick between; compare is entered by state as well. */
export type OtsActivity = 'write' | 'history';

/** What the activity bar highlights: the user's activity, or compare while a session is open. */
export type OtsActiveActivity = OtsActivity | 'compare';

/**
 * What a mode *is*, as plain data. Code that has to behave differently per mode (the canvas's
 * pointer handlers, the shell frame, how compare labels itself) reads a trait, not the kind.
 */
export interface ModeTraits {
  /** `none` for host surfaces (P6): no header, menu bar, activity bar or status bar. */
  readonly chrome: 'full' | 'none';
  /**
   * `edit` allows everything; `review` allows only what a reviewer does (no engine mutations,
   * and the canvas hands its clicks to the review gutter); `readonly` allows selection and
   * playback.
   */
  readonly interaction: InteractionPolicy;
  /**
   * `viewport` fills the window and scrolls inside it. `content` grows to its content and lets
   * the host scroll, which the scanner's row views need to size their iframe.
   */
  readonly layout: 'viewport' | 'content';
  /** The compare labels come from the URL (`leftLabel` / `rightLabel`) rather than the editor. */
  readonly labelsFromUrl: boolean;
}

export const MODE_TRAITS: Readonly<Record<OtsModeKind, ModeTraits>> = {
  write: { chrome: 'full', interaction: 'edit', layout: 'viewport', labelsFromUrl: false },
  compare: { chrome: 'full', interaction: 'edit', layout: 'viewport', labelsFromUrl: false },
  history: { chrome: 'full', interaction: 'readonly', layout: 'viewport', labelsFromUrl: false },
  // The compare panes police their own editing (compare-keyboard-policy); the main canvas is
  // not on screen, so `edit` changes nothing here.
  'host-compare': { chrome: 'none', interaction: 'edit', layout: 'viewport', labelsFromUrl: true },
  'host-change-review': {
    chrome: 'none',
    interaction: 'review',
    layout: 'viewport',
    labelsFromUrl: true,
  },
  'host-scanner-rows': {
    chrome: 'none',
    interaction: 'readonly',
    layout: 'content',
    labelsFromUrl: true,
  },
  'host-scanner-findings': {
    chrome: 'none',
    interaction: 'readonly',
    layout: 'content',
    labelsFromUrl: true,
  },
};

export interface OtsWorkspaceMode extends ModeTraits {
  readonly kind: OtsModeKind;
  /** The activity bar's highlight; undefined where there is no activity bar. */
  readonly activity?: OtsActiveActivity;
  /** Above the body, in order: the header, then the mode's toolbar. */
  readonly header?: React.ReactNode;
  readonly toolbar?: React.ReactNode;
  /** Floating overlays (the palettes), between the toolbar and the body. */
  readonly overlays?: React.ReactNode;
  /**
   * What fills the row between the activity bar and the status bar: a dock of canvas and
   * panels, as the builder composed it.
   */
  readonly body: React.ReactNode;
  /** Dialogs and overlays that live inside the body row, after the body. */
  readonly siblings?: React.ReactNode;
  readonly statusBar?: React.ReactNode;
  /** Commands registered while this mode is active (scope 'mode'). */
  readonly commands: readonly AnyCommand[];
}
