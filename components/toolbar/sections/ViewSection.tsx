import React from 'react';
import { Button } from '../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { ToolbarSectionProps } from '../types';
import { zoomPresets } from '../constants';
import {
  LayoutGrid,
  MoveHorizontal,
  MoveVertical,
  ZoomIn,
  ZoomOut,
  PanelRight,
} from 'lucide-react';

export const ViewSection: React.FC<ToolbarSectionProps> = ({
  onFitWidth,
  onFitHeight,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  zoomLevel,
  onTogglePalettes,
  palettesOpen,
  onTogglePanels,
  panelsVisible = true,
}) => {
  return (
    <>
      <Button
        data-testid="btn-fit-width"
        onClick={onFitWidth}
        disabled={!onFitWidth}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Fit Width"
        aria-label="Fit Width"
      >
        <MoveHorizontal size={14} />
      </Button>
      <Button
        data-testid="btn-fit-height"
        onClick={onFitHeight}
        disabled={!onFitHeight}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Fit Height"
        aria-label="Fit Height"
      >
        <MoveVertical size={14} />
      </Button>
      <div className="h-3 w-px bg-slate-200"></div>
      <Button
        data-testid="btn-zoom-out"
        onClick={onZoomOut}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut size={14} />
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="zoom-preset-trigger"
            title="Set zoom level (remembered per score)"
            className="min-w-[2.75rem] rounded bg-white px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {(zoomLevel * 100).toFixed(0)}%
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuLabel>Zoom</DropdownMenuLabel>
          {zoomPresets.map((preset) => (
            <DropdownMenuItem
              key={preset}
              data-testid={`zoom-preset-${Math.round(preset * 100)}`}
              disabled={!onSetZoom}
              onSelect={() => onSetZoom?.(preset)}
            >
              {Math.round(preset * 100)}%
            </DropdownMenuItem>
          ))}
          <DropdownMenuLabel>Fit</DropdownMenuLabel>
          <DropdownMenuItem
            data-testid="zoom-preset-fit-width"
            disabled={!onFitWidth}
            onSelect={() => onFitWidth?.()}
          >
            Fit width
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="zoom-preset-fit-height"
            disabled={!onFitHeight}
            onSelect={() => onFitHeight?.()}
          >
            Fit height
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        data-testid="btn-zoom-in"
        onClick={onZoomIn}
        variant="outline"
        size="xs"
        className="shadow-sm"
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn size={14} />
      </Button>
      <Button
        data-testid="btn-toggle-palettes"
        onClick={onTogglePalettes}
        disabled={!onTogglePalettes}
        variant={palettesOpen ? 'primary' : 'outline'}
        size="xs"
        className="shadow-sm"
        title="Show floating palettes"
        aria-label="Show floating palettes"
        aria-pressed={Boolean(palettesOpen)}
      >
        <LayoutGrid size={14} />
      </Button>
      <Button
        data-testid="btn-toggle-panels"
        onClick={onTogglePanels}
        disabled={!onTogglePanels}
        variant={panelsVisible ? 'outline' : 'primary'}
        size="xs"
        className="shadow-sm"
        title={panelsVisible ? 'Hide side panels' : 'Show side panels'}
        aria-label={panelsVisible ? 'Hide side panels' : 'Show side panels'}
        aria-pressed={!panelsVisible}
      >
        <PanelRight size={14} />
      </Button>
    </>
  );
};
