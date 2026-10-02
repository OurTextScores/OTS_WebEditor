'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  SCORE_PALETTE_DRAG_MIME,
  scorePaletteItems,
  type PaletteCategory,
  type ScorePaletteItem,
} from './toolbar/palette';
import { BeamIcon } from './toolbar/BeamIcon';
import { VoltaIcon } from './toolbar/VoltaIcon';
import styles from './FloatingPalettes.module.css';

export interface PaletteBrowserProps {
  disabled?: boolean;
  dragEnabled?: boolean;
  onApply: (item: ScorePaletteItem) => void;
  /** When set, shows a single category (e.g. all Clefs). */
  category?: PaletteCategory | null;
}

const allCategories = Array.from(new Set(scorePaletteItems.map((item) => item.category)));

/**
 * The searchable palette grid, with click-to-apply and drag onto the score. Shared by the
 * docked Palettes tab and the floating overlay, so both behave and test the same.
 */
export function PaletteBrowser({
  disabled = false,
  dragEnabled = false,
  onApply,
  category = null,
}: PaletteBrowserProps) {
  const [query, setQuery] = useState('');
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

  return (
    <>
      <label className="m-3 flex items-center gap-2 rounded border border-slate-300 px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent">
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
              <h3 className="mb-1 text-caption font-bold uppercase tracking-wider text-slate-500">
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
                      className="flex items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-line-control hover:bg-surface-hover disabled:opacity-50"
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
                        <span className="px-0.5 text-center text-caption font-medium leading-tight text-slate-700">
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
    </>
  );
}
