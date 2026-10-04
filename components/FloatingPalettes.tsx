'use client';

import { ESCAPE_PRIORITY } from './shell/keyboard/escapeLayers';
import { useEscapeLayer } from './shell/keyboard/useEscapeLayer';
import React, { useRef, useState } from 'react';
import { GripHorizontal, PanelLeftOpen, X } from 'lucide-react';
import { PaletteBrowser } from './PaletteBrowser';
import type { PaletteCategory, ScorePaletteItem } from './toolbar/palette';

interface FloatingPalettesProps {
  disabled?: boolean;
  dragEnabled?: boolean;
  onApply: (item: ScorePaletteItem) => void;
  onClose: () => void;
  /** Returns the palettes to the left panel (the v2 shell's pop-out / dock toggle). */
  onDock?: () => void;
  /** When set, the palette opens scoped to a single category (e.g. all Clefs). */
  category?: PaletteCategory | null;
}

const POSITION_KEY = 'ots.shell.palettesPosition';
const PALETTE_WIDTH = 320; // the overlay is `w-80`
const EDGE = 24;

/** Keeps the whole title bar (and with it the close button) inside the window, whatever the window size was when it was placed. */
const HANDLE_VISIBLE = 40;
function clampToWindow(position: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(0, position.x), Math.max(0, window.innerWidth - PALETTE_WIDTH)),
    y: Math.min(Math.max(0, position.y), Math.max(0, window.innerHeight - HANDLE_VISIBLE)),
  };
}

/**
 * Opens at the right edge, just under the toolbar: the left of the window is where the score starts,
 * so a palette opened there covers the first bar (and the toolbar's height varies as it wraps).
 */
function defaultPosition() {
  const toolbar = document.querySelector('[data-testid="tool-strip"]')?.getBoundingClientRect();
  return {
    x: Math.max(EDGE, window.innerWidth - PALETTE_WIDTH - EDGE),
    y: Math.max(110, Math.round((toolbar?.bottom ?? 0) + 8)),
  };
}

/** Where the overlay was last left; any storage or parse trouble means the default. */
function readPosition() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? 'null');
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return clampToWindow({ x: parsed.x, y: parsed.y });
    }
  } catch {
    // Fall through to the default.
  }
  return defaultPosition();
}

export function FloatingPalettes({
  disabled = false,
  dragEnabled = false,
  onApply,
  onClose,
  onDock,
  category = null,
}: FloatingPalettesProps) {
  const [position, setPosition] = useState(readPosition);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  // Escape closes the palette (it is a layer under any gesture or grip edit in progress).
  useEscapeLayer(true, ESCAPE_PRIORITY.palettes, onClose);

  const startMove = (event: React.PointerEvent) => {
    if ((event.target as Element).closest('button')) return;
    dragRef.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <aside
      data-testid="floating-palettes"
      className="fixed z-float flex w-80 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-raised"
      style={{ left: position.x, top: position.y, maxHeight: '70vh' }}
    >
      <div
        data-testid="floating-palettes-handle"
        className="flex cursor-move items-center gap-2 border-b border-slate-200 bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
        onPointerDown={startMove}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          setPosition(
            clampToWindow({
              x: event.clientX - dragRef.current.dx,
              y: event.clientY - dragRef.current.dy,
            }),
          );
        }}
        onPointerUp={(event) => {
          if (dragRef.current) {
            try {
              window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
            } catch {
              // Not remembering the position is fine.
            }
          }
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <GripHorizontal size={16} aria-hidden="true" />
        <span className="flex-1">{category ? `${category} palette` : 'Palettes'}</span>
        {onDock && (
          <button
            type="button"
            data-testid="btn-palettes-dock"
            onClick={onDock}
            className="rounded p-0.5 hover:bg-slate-700"
            aria-label="Dock palettes in the side panel"
            title="Dock in the side panel"
          >
            <PanelLeftOpen size={15} />
          </button>
        )}
        <button
          type="button"
          data-testid="btn-close-palettes"
          onClick={onClose}
          className="rounded p-0.5 hover:bg-slate-700"
          aria-label="Close palettes"
        >
          <X size={15} />
        </button>
      </div>
      <PaletteBrowser
        disabled={disabled}
        dragEnabled={dragEnabled}
        onApply={onApply}
        category={category}
      />
    </aside>
  );
}
