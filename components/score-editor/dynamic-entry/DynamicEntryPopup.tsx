'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { useRegisterCommands } from '../../../lib/commands/useRegisterCommands';
import { invokeCommand } from '../../shell/invokeCommand';
import { Button } from '../../ui/Button';
import { buildDynamicEntryCommands } from './dynamicEntryCommands';
import { getDynamicEntry, setDynamicEntry, subscribeToDynamicEntry } from './dynamicEntryStore';
import { dynamicCandidates, matchDynamic, type DynamicOption } from './dynamicMatch';

const COMMANDS = buildDynamicEntryCommands();

/** The popup's field and choices; keyed by each opening, so it starts empty. */
function DynamicEntryForm({ x, y }: { x: number; y: number }) {
  const [typed, setTyped] = useState('');
  const candidates = dynamicCandidates(typed).slice(0, 12);
  const add = (option: DynamicOption | null) => {
    setDynamicEntry(null);
    if (option) void invokeCommand('add.mark.dynamic', option.value);
  };
  return (
    <div
      role="dialog"
      aria-label="Add dynamic"
      data-testid="dynamic-entry"
      className="fixed z-modal w-56 rounded border border-slate-300 bg-white p-2 shadow-modal"
      style={{ left: Math.max(8, x), top: Math.max(8, y) }}
    >
      <input
        aria-label="Dynamic"
        data-testid="dynamic-entry-input"
        autoFocus
        placeholder="mf, sfz, fp…"
        className="h-7 w-full rounded border border-slate-300 px-2 text-sm text-slate-800"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={() => setDynamicEntry(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add(matchDynamic(typed));
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDynamicEntry(null);
          }
        }}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {candidates.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="quiet"
            data-testid={`dynamic-entry-${option.label}`}
            // Before the field's blur closes the popup
            onMouseDown={(event) => {
              event.preventDefault();
              add(option);
            }}
            className="font-serif italic"
          >
            {option.label}
          </Button>
        ))}
        {candidates.length === 0 && (
          <span className="text-xs text-slate-500">No dynamic is called that</span>
        )}
      </div>
    </div>
  );
}

/**
 * The dynamic popup (roadmap E11, after desktop MuseScore's add-dynamic): opened by Add ▸ Marks ▸ Dynamic… at the
 * selected note. Type the dynamic (mf, sfz…) and Enter, or pick one; it is added through Add ▸ Marks ▸ Dynamics, one
 * undoable edit. Escape or leaving the field closes it. Registers its command.
 */
export function DynamicEntryPopup() {
  useRegisterCommands('global', COMMANDS);
  const anchor = useSyncExternalStore(subscribeToDynamicEntry, getDynamicEntry, () => null);
  return anchor ? (
    <DynamicEntryForm key={`${anchor.x},${anchor.y}`} x={anchor.x} y={anchor.y} />
  ) : null;
}
