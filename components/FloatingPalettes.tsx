'use client';

import React, { useEffect, useRef, useState } from 'react';
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
const DEFAULT_POSITION = { x: 24, y: 110 };

/** Where the overlay was last left; any storage or parse trouble means the default. */
function readPosition() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(POSITION_KEY) ?? 'null');
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return { x: Math.max(0, parsed.x), y: Math.max(0, parsed.y) };
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_POSITION;
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
  // Escape closes the palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const startMove = (event: React.PointerEvent) => {
    if ((event.target as Element).closest('button')) return;
    dragRef.current = { dx: event.clientX - position.x, dy: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <aside
      data-testid="floating-palettes"
      className="fixed z-[120] flex w-80 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
      style={{ left: position.x, top: position.y, maxHeight: '70vh' }}
    >
      <div
        data-testid="floating-palettes-handle"
        className="flex cursor-move items-center gap-2 border-b border-slate-200 bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
        onPointerDown={startMove}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          setPosition({
            x: Math.max(0, event.clientX - dragRef.current.dx),
            y: Math.max(0, event.clientY - dragRef.current.dy),
          });
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
