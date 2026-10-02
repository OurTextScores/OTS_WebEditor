'use client';

import { PanelTopOpen } from 'lucide-react';
import React, { type CSSProperties } from 'react';
import type { SelectedElementProperties } from '../../lib/webmscore-loader';
import { InspectorPanel } from '../InspectorPanel';
import { PaletteBrowser } from '../PaletteBrowser';
import type { InstrumentTemplateGroup, PartSummary } from '../score-editor/editorProps';
import type { PaletteCategory, ScorePaletteItem } from '../toolbar/palette';
import { InstrumentsPanel } from './InstrumentsPanel';
import { PANEL_LIMITS } from './useShellPanels';
import { Panel } from './vendor/viritura';
import type { DockTab, WorkspaceDock } from './useWorkspaceDock';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const TABS: readonly { tab: DockTab; label: string; shortcut: string }[] = [
  { tab: 'palettes', label: 'Palettes', shortcut: 'F9' },
  { tab: 'instruments', label: 'Instruments', shortcut: 'F7' },
  { tab: 'properties', label: 'Properties', shortcut: 'F8' },
];

type InspectorProps = React.ComponentProps<typeof InspectorPanel>;

export interface LeftDockProps {
  /** `side` and `width` are read by the WorkspaceShell to position and stack the panel. */
  side: 'left';
  width: number;
  /** Also read by the shell, to know how far this panel may shrink. */
  min: number;
  onResize: (width: number) => void;
  shellStyle?: CSSProperties;
  dock: WorkspaceDock;
  palettes: {
    disabled: boolean;
    dragEnabled: boolean;
    onApply: (item: ScorePaletteItem) => void;
    /** Scopes the grid to one category (set by the ribbon's "Open … Palette" entries). */
    category: PaletteCategory | null;
    onShowAll: () => void;
  };
  instruments: { parts: readonly PartSummary[]; groups: readonly InstrumentTemplateGroup[] };
  inspector: Pick<
    InspectorProps,
    'loading' | 'disabled' | 'onChange' | 'fretDiagram' | 'onFretDiagramChange'
  > & { data: SelectedElementProperties | null };
}

/**
 * The left panel of the Write mode (SHELL_REDESIGN_DESIGN §8.3): Palettes, Instruments and
 * Properties as tabs in one dock, toggled by F9, F7 and F8. Palettes can pop out into the
 * floating overlay and dock back.
 */
export function LeftDock({
  side,
  width,
  min,
  onResize,
  shellStyle,
  dock,
  palettes,
  instruments,
  inspector,
}: LeftDockProps) {
  return (
    <Panel
      side={side}
      width={width}
      shellStyle={shellStyle}
      onResize={onResize}
      min={min}
      max={PANEL_LIMITS.left.max}
      onCollapse={dock.close}
      ariaLabel="Side panel"
      testId="left-dock"
      resizeTestId="left-dock-resize"
    >
      <div className="flex shrink-0 items-center border-b border-slate-200 px-1 pt-1">
        <div role="tablist" aria-label="Side panel" className="flex min-w-0 flex-1">
          {TABS.map(({ tab, label, shortcut }) => {
            const selected = dock.tab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`dock-tab-${tab}`}
                aria-selected={selected}
                aria-controls={`dock-tabpanel-${tab}`}
                data-testid={`dock-tab-${tab}`}
                title={`${label} (${shortcut})`}
                onClick={() => dock.show(tab)}
                className={`rounded-t px-2.5 py-1.5 text-xs font-medium ${
                  selected
                    ? 'border-b-2 border-blue-600 text-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <IconButton label="Close side panel" data-testid="btn-dock-close" onClick={dock.close}>
          ✕
        </IconButton>
      </div>

      <div
        role="tabpanel"
        id={`dock-tabpanel-${dock.tab}`}
        aria-labelledby={`dock-tab-${dock.tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {dock.tab === 'palettes' && dock.poppedOut && (
          <div className="p-4 text-sm text-slate-600">
            <p>The palettes are in a floating window.</p>
            <Button
              variant="neutral"
              data-testid="btn-palettes-dock-here"
              onClick={() => dock.setPoppedOut(false)}
              className="mt-2"
            >
              Dock them here
            </Button>
          </div>
        )}
        {dock.tab === 'palettes' && !dock.poppedOut && (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2 text-xs text-slate-500">
              <span className="min-w-0 truncate">
                {palettes.category ? (
                  <>
                    {palettes.category}{' '}
                    <Button
                      variant="link"
                      size="text"
                      data-testid="btn-palettes-show-all"
                      onClick={palettes.onShowAll}
                    >
                      Show all
                    </Button>
                  </>
                ) : (
                  'All palettes'
                )}
              </span>
              <Button
                variant="quiet"
                size="bar"
                data-testid="btn-palettes-pop-out"
                onClick={() => dock.setPoppedOut(true)}
                title="Pop out into a floating window"
                aria-label="Pop out palettes"
                className="gap-1"
              >
                <PanelTopOpen size={13} aria-hidden="true" />
                Pop out
              </Button>
            </div>
            <PaletteBrowser
              disabled={palettes.disabled}
              dragEnabled={palettes.dragEnabled}
              onApply={palettes.onApply}
              category={palettes.category}
            />
          </>
        )}
        {dock.tab === 'instruments' && (
          <InstrumentsPanel parts={instruments.parts} instrumentGroups={instruments.groups} />
        )}
        {dock.tab === 'properties' && <InspectorPanel embedded {...inspector} />}
      </div>
    </Panel>
  );
}
