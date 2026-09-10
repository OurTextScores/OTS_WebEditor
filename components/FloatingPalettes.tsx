'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GripHorizontal, Search, X } from 'lucide-react';
import {
  SCORE_PALETTE_DRAG_MIME,
  scorePaletteItems,
  type PaletteCategory,
  type ScorePaletteItem,
} from './toolbar/palette';
import { BeamIcon } from './toolbar/BeamIcon';
import { VoltaIcon } from './toolbar/VoltaIcon';
import styles from './FloatingPalettes.module.css';

interface FloatingPalettesProps {
  disabled?: boolean;
  dragEnabled?: boolean;
  onApply: (item: ScorePaletteItem) => void;
  onClose: () => void;
  /** When set, the palette opens scoped to a single category (e.g. all Clefs). */
  category?: PaletteCategory | null;
}

const allCategories = Array.from(new Set(scorePaletteItems.map((item) => item.category)));

export function FloatingPalettes({
  disabled = false,
  dragEnabled = false,
  onApply,
  onClose,
  category = null,
}: FloatingPalettesProps) {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ x: 24, y: 110 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const categories = category ? [category] : allCategories;
  const visibleItems = useMemo(
    () =>
      scorePaletteItems.filter(
        (item) =>
          item.label.toLowerCase().includes(normalizedQuery) ||
          item.category.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

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
          dragRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <GripHorizontal size={16} aria-hidden="true" />
        <span className="flex-1">{category ? `${category} palette` : 'Palettes'}</span>
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
      <label className="m-3 flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5">
        <Search size={14} className="text-slate-500" aria-hidden="true" />
        <input
          data-testid="palette-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search palettes"
          className="min-w-0 flex-1 text-sm outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {categories.map((category) => {
          const items = visibleItems.filter((item) => item.category === category);
          if (!items.length) return null;
          return (
            <section
              key={category}
              data-testid={`palette-category-${category.toLowerCase()}`}
              className="mb-4 last:mb-0"
            >
              <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {category}
              </h3>
              <div className="grid grid-cols-4 gap-1">
                {items.map((item) => {
                  const canDrag = dragEnabled && item.elementType !== undefined;
                  return (
                    <button
                      key={`${item.kind}-${item.subtype}`}
                      type="button"
                      data-testid={`palette-item-${item.kind}-${item.subtype}`}
                      draggable={canDrag}
                      disabled={disabled && !canDrag}
                      title={`${item.label}${canDrag ? ' — click to apply, or drag onto the score' : ' — click to apply'}`}
                      onClick={() => {
                        if (!disabled) onApply(item);
                      }}
                      onDragStart={(event) => {
                        if (!canDrag) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData(SCORE_PALETTE_DRAG_MIME, JSON.stringify(item));
                        event.dataTransfer.setData('text/plain', item.label);
                      }}
                      className="flex items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                      style={{ height: '3.25rem' }}
                    >
                      {item.kind === 'beam' ? (
                        <BeamIcon value={item.subtype} className="text-slate-800" />
                      ) : item.kind === 'volta' ? (
                        <VoltaIcon value={item.subtype} className="text-slate-800" />
                      ) : item.kind === 'jump' ? (
                        <span className={styles.textGlyph}>{item.label}</span>
                      ) : item.symbol ? (
                        <span className={styles.glyph}>{item.symbol}</span>
                      ) : (
                        <span className="px-0.5 text-center text-[10px] font-medium leading-tight text-slate-700">
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!visibleItems.length && (
          <p className="py-6 text-center text-sm text-slate-500">No palette items match.</p>
        )}
      </div>
    </aside>
  );
}
