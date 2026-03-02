import React from 'react';
import { Button } from '../../ui/Button';
import { ToolbarSectionProps } from '../types';
import { MoveHorizontal, MoveVertical, ZoomIn, ZoomOut } from 'lucide-react';

export const ViewSection: React.FC<ToolbarSectionProps> = ({
    onFitWidth,
    onFitHeight,
    onZoomIn,
    onZoomOut,
    zoomLevel,
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
            <span className="min-w-[2.5rem] rounded bg-white px-1.5 py-0.5 text-center text-[11px] font-bold text-slate-700 shadow-sm">
                {(zoomLevel * 100).toFixed(0)}%
            </span>
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
        </>
    );
};
