import { useCallback, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

const STORAGE_KEY = 'ots.compare.gutterCollapsed';

/** Collapsed state of the compare gutter, remembered per browser. */
export function useCompareGutterCollapsed(): [boolean, () => void] {
  // A lazy read is hydration-safe: nothing that depends on it renders until a
  // comparison is opened, which is always after mount.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, prev ? '0' : '1');
      } catch {
        // Private window: the toggle still works for this session.
      }
      return !prev;
    });
  }, []);
  return [collapsed, toggle];
}

export type CompareGutterColumnProps = {
  collapsed: boolean;
  onToggle: () => void;
  /** Expanded width in px (the AI and change-review modes size it); null = the default w-44. */
  width: number | null;
  /** Shown above the scrolling region (the AI measure comments). */
  header?: ReactNode;
  /** The scrolling region the panes sync with. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** A pane whose scrollTop the gutter adopts when it is shown again. */
  scrollSourceRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
};

/**
 * The column between the two compare panes. Collapsed, it is a thin strip with a
 * show button (the Compare toolbar carries the hide/show toggle too). The content
 * stays mounted while collapsed, only hidden, so the scroll-sync listeners bound to
 * `scrollRef` survive the toggle; a hidden element ignores scrollTop, so on expand
 * the gutter re-adopts the pane's position.
 */
export function CompareGutterColumn({
  collapsed,
  onToggle,
  width,
  header,
  scrollRef,
  scrollSourceRef,
  children,
}: CompareGutterColumnProps) {
  useLayoutEffect(() => {
    if (collapsed) return;
    const gutter = scrollRef.current;
    const source = scrollSourceRef.current;
    if (gutter && source) gutter.scrollTop = source.scrollTop;
  }, [collapsed, scrollRef, scrollSourceRef]);

  return (
    <div
      data-testid="compare-gutter"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={`flex min-h-0 flex-none flex-col gap-2 ${collapsed ? 'w-8 items-center rounded border border-slate-200 bg-slate-50 pt-1' : `items-stretch ${width === null ? 'w-44' : ''}`}`}
      style={collapsed || width === null ? undefined : { width: `${width}px` }}
    >
      {collapsed && (
        <IconButton
          data-testid="compare-gutter-expand"
          label="Show comparison gutter"
          onClick={onToggle}
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
      <div className={collapsed ? 'hidden' : 'contents'}>
        {header}
        <div
          ref={scrollRef}
          data-testid="compare-gutter-scroll"
          className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-visible overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-caption text-slate-500"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
