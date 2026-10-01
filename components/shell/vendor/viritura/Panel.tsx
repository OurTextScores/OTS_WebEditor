/**
 * Vendored from Viritura (https://github.com/viritura, commit cab0def), MIT License,
 * Copyright (c) 2026 Viritura contributors. Modified for OTS_Web: opaque surfaces on the shell
 * tokens instead of glass, a landmark role, test-id props, and no status-zone (OTS has its own
 * StatusBar). See THIRD_PARTY_NOTICES.md at the repository root.
 */
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import styles from './Panel.module.css';

const COLLAPSE_DRAG_THRESHOLD = 32;

export type PanelSide = 'left' | 'right';

export interface PanelProps {
  /** Which edge of the workspace this panel docks to. Read by WorkspaceShell. */
  side: PanelSide;
  /** Panel width in pixels. */
  width: number;
  /** Resize callback. When provided, an edge drag handle is rendered. */
  onResize?: (width: number) => void;
  min?: number;
  max?: number;
  /** Collapses the panel when its handle is dragged below the minimum width. */
  onCollapse?: () => void;

  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Renders a close button in the header. */
  onClose?: () => void;
  closeLabel?: string;
  closeTestId?: string;

  footer?: ReactNode;
  /** Wrap children in an overflow:auto column body. */
  scrollBody?: boolean;

  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  /** Landmark name; defaults to the title when that is text. */
  ariaLabel?: string;
  testId?: string;
  /** Test id for the edge resize handle. */
  resizeTestId?: string;

  /** Positioning injected by <WorkspaceShell>; do not set by hand inside a shell. */
  shellStyle?: CSSProperties;

  children?: ReactNode;
}

export function Panel({
  side,
  width,
  onResize,
  min = 200,
  max = 500,
  onCollapse,
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Close panel',
  closeTestId,
  footer,
  scrollBody = false,
  zIndex = 2,
  className,
  style,
  ariaLabel,
  testId,
  resizeTestId,
  shellStyle,
  children,
}: PanelProps) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const hasHeader = title !== undefined || onClose !== undefined;
  const bodyClass = scrollBody ? `${styles.body} ${styles.bodyScroll}` : styles.body;
  const rootStyle: CSSProperties = { width: dragWidth ?? width, zIndex, ...shellStyle, ...style };
  // The resize handle sits on the inboard edge: opposite the docked side.
  const handleSide: PanelSide = side === 'left' ? 'right' : 'left';
  const label = ariaLabel ?? (typeof title === 'string' ? title : undefined);

  return (
    <aside
      aria-label={label}
      data-testid={testId}
      className={className ? `${styles.panel} ${className}` : styles.panel}
      style={rootStyle}
    >
      <div className={styles.chrome}>
        {hasHeader && (
          <div className={styles.header}>
            <div className={styles.headerRow}>
              <span className={styles.title}>{title}</span>
              {(actions !== undefined || onClose !== undefined) && (
                <span className={styles.headerActions}>
                  {actions}
                  {onClose !== undefined && (
                    <button
                      type="button"
                      className={styles.closeButton}
                      onClick={onClose}
                      aria-label={closeLabel}
                      title={closeLabel}
                      data-testid={closeTestId}
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
            {subtitle !== undefined && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
        )}
        {hasHeader || footer !== undefined || scrollBody ? (
          <div className={bodyClass}>{children}</div>
        ) : (
          children
        )}
        {footer !== undefined && <div className={styles.footer}>{footer}</div>}
      </div>
      {onResize !== undefined && (
        <ResizeHandle
          side={handleSide}
          startWidth={width}
          onDrag={onResize}
          onDragPreview={setDragWidth}
          onCollapse={onCollapse}
          min={min}
          max={max}
          testId={resizeTestId}
        />
      )}
    </aside>
  );
}

interface ResizeHandleProps {
  side: PanelSide;
  startWidth: number;
  onDrag: (width: number) => void;
  onDragPreview: (width: number | null) => void;
  onCollapse?: () => void;
  min: number;
  max: number;
  testId?: string;
}

function ResizeHandle({
  side,
  startWidth,
  onDrag,
  onDragPreview,
  onCollapse,
  min,
  max,
  testId,
}: ResizeHandleProps) {
  const dragRef = useRef<{ startX: number; startW: number; rawWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startW: startWidth, rawWidth: startWidth };
    },
    [startWidth],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;
      if (!state) return;
      const dx = event.clientX - state.startX;
      // A "right" handle is the right edge of a left-docked panel: dragging right grows it.
      // A "left" handle is the left edge of a right-docked panel: dragging left grows it.
      const next = side === 'right' ? state.startW + dx : state.startW - dx;
      state.rawWidth = next;
      if (onCollapse && next <= min - COLLAPSE_DRAG_THRESHOLD) {
        dragRef.current = null;
        onDragPreview(null);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Already released.
        }
        onCollapse();
        return;
      }
      onDragPreview(Math.max(min - COLLAPSE_DRAG_THRESHOLD, Math.min(max, next)));
      if (next >= min) onDrag(Math.min(max, next));
    },
    [side, onDrag, onDragPreview, onCollapse, min, max],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }
      const drag = dragRef.current;
      dragRef.current = null;
      onDragPreview(null);
      if (drag && drag.rawWidth < min) onDrag(min);
    },
    [min, onDrag, onDragPreview],
  );

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    onDragPreview(null);
  }, [onDragPreview]);

  return (
    <div
      className={styles.resize}
      data-side={side}
      data-testid={testId}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}
