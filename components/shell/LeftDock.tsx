'use client';

import { PanelTopOpen } from 'lucide-react';
import React, { type CSSProperties } from 'react';
import type { SelectedElementProperties } from '../../lib/webmscore-loader';
import { InspectorPanel } from '../InspectorPanel';
import { PaletteBrowser } from '../PaletteBrowser';
import type { InstrumentTemplateGroup, PartSummary } from '../score-editor/editorProps';
import type { PaletteCategory, ScorePaletteItem } from '../toolbar/palette';
import { EditsPanel, type EditsPanelProps } from './EditsPanel';
import { InstrumentsPanel } from './InstrumentsPanel';
import { PANEL_LIMITS } from './useShellPanels';
import { Panel } from './vendor/viritura';
import { DOCK_PANELS } from './activities';
import type { WorkspaceDock } from './useWorkspaceDock';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

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
  /** The undo history (the Edits tab). */
  edits: EditsPanelProps;
  inspector: Pick<
    InspectorProps,
    | 'loading'
    | 'disabled'
    | 'onChange'
    | 'fretDiagram'
    | 'onFretDiagramChange'
    | 'systemLayout'
    | 'notation'
  > & { data: SelectedElementProperties | null };
}

/**
 * The left panel of the Write mode (SHELL_REDESIGN_DESIGN §8.3): Palettes, Instruments, Properties (F9, F7, F8) or
 * the Edits history, one at a time, each chosen by its icon in the activity bar (as VS Code's side bar). The header
 * names the panel showing. Palettes can pop out into the floating overlay and dock back.
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
  edits,
}: LeftDockProps) {
  const current = DOCK_PANELS.find((panel) => panel.id === dock.tab);
  return (
    <Panel
      side={side}
      width={width}
      shellStyle={shellStyle}
      onResize={onResize}
      min={min}
      max={PANEL_LIMITS.left.max}
      onCollapse={dock.close}
      ariaLabel={current ? `${current.label} panel` : 'Side panel'}
      testId="left-dock"
      resizeTestId="left-dock-resize"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 py-1 pl-3 pr-0.5">
        <h2
          id={`dock-title-${dock.tab}`}
          data-testid="dock-title"
          title={current?.shortcut ? `${current.label} (${current.shortcut})` : current?.label}
          className="text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          {current?.label}
        </h2>
        <IconButton label="Close side panel" data-testid="btn-dock-close" onClick={dock.close}>
          ✕
        </IconButton>
      </div>

      <div
        role="region"
        id={`dock-panel-${dock.tab}`}
        aria-labelledby={`dock-title-${dock.tab}`}
        data-testid={`dock-panel-body-${dock.tab}`}
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
        {dock.tab === 'edits' && <EditsPanel {...edits} />}
      </div>
    </Panel>
  );
}
