'use client';

import React, { useSyncExternalStore } from 'react';
import type { CommandRegistry } from '../../lib/commands/registry';
import { getPartsSnapshot, subscribeToParts } from '../score-editor/parts';
import { invokeCommand } from './invokeCommand';

const GENERATE = 'generate';

/**
 * The status bar's part selector (roadmap E18): the full score or one of its parts, and, for a score without parts,
 * making them from the instruments. Every choice runs a command.
 */
export function PartSelect({
  registry,
  disabled,
}: {
  registry: CommandRegistry;
  disabled: boolean;
}) {
  const { score, parts, current } = useSyncExternalStore(
    subscribeToParts,
    getPartsSnapshot,
    getPartsSnapshot,
  );
  if (!score) return null;
  return (
    <select
      aria-label="Part"
      data-testid="part-select"
      value={String(current)}
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        if (value === GENERATE) void invokeCommand('view.part.generate', undefined, registry);
        else void invokeCommand('view.part.show', Number(value), registry);
      }}
      className="h-6 max-w-[12rem] truncate rounded border border-slate-200 bg-white px-1 text-xs text-slate-700"
    >
      <option value="-1">Full score</option>
      {parts.map((part, index) => (
        <option key={`${index}:${part.name}`} value={String(index)}>
          {part.name}
        </option>
      ))}
      {parts.length === 0 && <option value={GENERATE}>Make parts from instruments…</option>}
    </select>
  );
}
