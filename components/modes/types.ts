import type { ReactNode } from 'react';
import type { WorkspaceInsets } from '../shell/workspaceMode';
import type { WriteDockProps } from '../shell/WriteWorkspace';
import type { PanelState } from '../shell/vendor/viritura';

/** Which compare body to draw: the usual two panes, or one of the scanner's row views. */
export type CompareVariant = 'default' | 'rows' | 'findings';

export interface CompareRenderOptions {
  variant: CompareVariant;
  /** A fixed overlay over the whole window (today), or filling the workspace body (v2 Compare). */
  placement: 'overlay' | 'inline';
  /** Shown inside a host's frame: no chrome of its own, host-supplied labels and actions. */
  hosted: boolean;
  /** Grows to its content rather than filling the window (the scanner's row views). */
  grows: boolean;
}

/**
 * Everything a mode builder can put on screen, already built by `ScoreEditor`, which owns the
 * state behind it. A builder only chooses which of these a mode shows and how they are laid
 * out; it holds no state and reads no mode flags of its own.
 */
export interface ModeNodes {
  header: ReactNode;
  /** The ribbon (until Phase 5 replaces it with per-mode toolbars). */
  ribbon: ReactNode;
  floatingPalettes: ReactNode;
  statusBar: ReactNode;
  /** The score canvas: the scroll container the engine draws into. */
  canvas: (insets: WorkspaceInsets) => ReactNode;
  /** The review gutter beside the canvas in a single-score change review. */
  changeReviewPanel: ReactNode;
  /** The History sidebar of the legacy shell. */
  legacyHistorySidebar: ReactNode;
  /** The legacy shell's right-hand sidebars and collapsed-panel strip. */
  legacyPanels: ReactNode;
  /** Write mode's dock: palettes, instruments, properties, AI Tools, Score Source. */
  write: WriteDockProps;
  /** The History panel's content (checkpoints, versions, scores) and its width. */
  historyContent: ReactNode;
  historyWidth: PanelState;
  dialogs: ReactNode;
  compare: (options: CompareRenderOptions) => ReactNode;
  /** The spinner a host surface shows while its scores load. */
  hostBusy: ReactNode;
}

export interface BuildContext {
  /** `?shell=legacy`: the ribbon-and-sidebars layout, no activity bar or status bar. */
  legacy: boolean;
  nodes: ModeNodes;
}
