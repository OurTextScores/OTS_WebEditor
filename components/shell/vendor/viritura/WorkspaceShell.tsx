/**
 * Vendored from Viritura (https://github.com/viritura, commit cab0def), MIT License,
 * Copyright (c) 2026 Viritura contributors. Modified for OTS_Web: opaque surfaces on the shell
 * tokens instead of glass, a landmark role, test-id props, and no status-zone (OTS has its own
 * StatusBar). See THIRD_PARTY_NOTICES.md at the repository root.
 */
import {
  Children,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Panel, type PanelProps } from './Panel';
import {
  MIN_CANVAS_WIDTH,
  OVERLAY_MIN_WIDTH,
  PANEL_GAP,
  PANEL_HANDLE_INSET,
  PANEL_INSET,
} from './shellMetrics';
import styles from './WorkspaceShell.module.css';

export interface WorkspaceInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** No panels, so no space to keep clear. */
export const NO_INSETS: WorkspaceInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export interface WorkspaceShellProps {
  /**
   * Render prop for the underlay (the score canvas). Receives the space the docked panels
   * cover, so the canvas can keep its scroll and zoom origin inside the safe area.
   */
  canvas?: (insets: WorkspaceInsets) => ReactNode;
  /** Shows a persistent edge affordance when the side panels are hidden. */
  showPanelHandle?: boolean;
  /** Brings the hidden panels back. */
  onTogglePanels?: () => void;
  /**
   * Called when the canvas is pressed while the panels are overlaying it (too little room to
   * dock them), so they can get out of the way.
   */
  onOverlayDismiss?: () => void;
  className?: string;
  style?: CSSProperties;
  /** <Panel> children, plus any overlays, which render after the panels untouched. */
  children?: ReactNode;
}

/**
 * The dock: a canvas underlay with panels floated over its edges. The shell scans its
 * children for panels, stacks them by `side` in source order (the first right panel flush
 * to the right edge, the next to its left, and so on) and injects each one's position.
 * The occupied width on each side goes back to `canvas` as `insets`.
 */
export function WorkspaceShell({
  canvas,
  showPanelHandle = false,
  onTogglePanels,
  onOverlayDismiss,
  className,
  style,
  children,
}: WorkspaceShellProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // The dock reflows with its own width, so it is measured, not read from the window.
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { panels, others } = splitChildren(children);
  const { positioned, insets: panelInsets, mode } = layoutPanels(panels, width);
  const insets: WorkspaceInsets = {
    ...panelInsets,
    left: showPanelHandle ? Math.max(panelInsets.left, PANEL_HANDLE_INSET) : panelInsets.left,
  };

  return (
    <div
      ref={rootRef}
      data-testid="workspace-shell"
      data-layout={mode}
      className={className ? `${styles.shell} ${className}` : styles.shell}
      style={style}
    >
      {canvas !== undefined && (
        <div
          className={styles.canvasLayer}
          onPointerDownCapture={mode === 'overlay' ? onOverlayDismiss : undefined}
        >
          {canvas(insets)}
        </div>
      )}
      {positioned}
      {others}
      {showPanelHandle && onTogglePanels !== undefined && (
        <button
          type="button"
          className={styles.panelHandle}
          onClick={onTogglePanels}
          aria-label="Show panels"
          title="Show panels"
          data-testid="show-panels-handle"
        />
      )}
    </div>
  );
}

/**
 * A child is a panel if it is the Panel primitive, or a wrapper that exposes a `side` and a
 * numeric `width` and spreads the injected `shellStyle` onto its inner Panel.
 */
function isPanelLike(child: ReactElement<unknown>): child is ReactElement<PanelProps> {
  if (child.type === Panel) return true;
  const props = child.props as Partial<PanelProps> | null | undefined;
  if (!props) return false;
  return (props.side === 'left' || props.side === 'right') && typeof props.width === 'number';
}

function splitChildren(children: ReactNode): {
  panels: ReactElement<PanelProps>[];
  others: ReactNode[];
} {
  const panels: ReactElement<PanelProps>[] = [];
  const others: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && isPanelLike(child)) panels.push(child);
    else if (child !== null && child !== undefined && child !== false && child !== true) {
      others.push(child);
    }
  });
  return { panels, others };
}

export type ShellLayoutMode = 'docked' | 'overlay';

/** Occupied width of one side: the outer inset, each panel, and a gap between neighbours. */
const sideWidth = (widths: readonly number[]) =>
  widths.length === 0
    ? 0
    : PANEL_INSET + widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * PANEL_GAP;

/**
 * Stacks panels per side and returns what they occupy (edge to workspace edge).
 *
 * With a measured `available` width the panels have to leave the canvas `MIN_CANVAS_WIDTH`.
 * When they do not at their natural widths they shrink, each toward its own `min`, in
 * proportion to how much it can give; when even that is not enough they stop docking and
 * overlay the canvas at their minimum widths (`mode: 'overlay'`, insets 0), and the shell
 * reports the press on the canvas so they can be dismissed.
 */
export function layoutPanels(
  panels: readonly ReactElement<PanelProps>[],
  available = 0,
): { positioned: ReactNode[]; insets: WorkspaceInsets; mode: ShellLayoutMode } {
  const naturals = panels.map((panel) => panel.props.width);
  const mins = panels.map((panel) => Math.min(panel.props.width, panel.props.min ?? 200));
  const sides = panels.map((panel) => panel.props.side);
  const occupied = (widths: readonly number[]) =>
    sideWidth(widths.filter((_, i) => sides[i] === 'left')) +
    sideWidth(widths.filter((_, i) => sides[i] === 'right'));

  let widths = naturals;
  let mode: ShellLayoutMode = 'docked';
  const budget = available - MIN_CANVAS_WIDTH;
  if (available > 0 && occupied(naturals) > budget) {
    const shrinkable = naturals.reduce((sum, w, i) => sum + (w - mins[i]), 0);
    const excess = occupied(naturals) - budget;
    if (shrinkable > 0 && excess <= shrinkable) {
      const scale = excess / shrinkable;
      widths = naturals.map((w, i) => Math.round(w - (w - mins[i]) * scale));
    } else {
      mode = 'overlay';
      // Overlaid panels still must not sit on one another: below their minimums, but never
      // under a floor where their contents stop being usable.
      widths = mins;
      const room = available - PANEL_INSET;
      if (occupied(mins) > room) {
        const slack = mins.reduce((sum, w) => sum + Math.max(0, w - OVERLAY_MIN_WIDTH), 0);
        const over = occupied(mins) - room;
        const scale = slack > 0 ? Math.min(1, over / slack) : 0;
        widths = mins.map((w) => Math.round(w - Math.max(0, w - OVERLAY_MIN_WIDTH) * scale));
      }
    }
  }

  let leftCursor = PANEL_INSET;
  let rightCursor = PANEL_INSET;
  const positioned = panels.map((panel, index) => {
    const side = sides[index];
    const width = widths[index];
    const offset = side === 'left' ? leftCursor : rightCursor;
    const shellStyle: CSSProperties = {
      position: 'absolute',
      top: 0,
      marginTop: PANEL_INSET,
      marginBottom: PANEL_INSET,
      height: `calc(100% - ${PANEL_INSET * 2}px)`,
      ...(side === 'left' ? { left: offset } : { right: offset }),
    };
    if (side === 'left') leftCursor += width + PANEL_GAP;
    else rightCursor += width + PANEL_GAP;
    return cloneElement(panel, { shellStyle, width, key: panel.key ?? index });
  });

  if (mode === 'overlay') {
    return { positioned, insets: { left: 0, right: 0, top: 0, bottom: 0 }, mode };
  }
  // Each cursor sits one gap past its last panel; take it back out so insets are occupied width.
  const left = leftCursor === PANEL_INSET ? 0 : leftCursor - PANEL_GAP;
  const right = rightCursor === PANEL_INSET ? 0 : rightCursor - PANEL_GAP;
  return { positioned, insets: { left, right, top: 0, bottom: 0 }, mode };
}
