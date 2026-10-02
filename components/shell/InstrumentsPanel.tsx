'use client';

import React, { useMemo, useState } from 'react';
import { defaultCommandRegistry, type CommandRegistry } from '../../lib/commands/registry';
import { useCommandContext } from '../../lib/commands/useRegisterCommands';
import type { InstrumentTemplateGroup, PartSummary } from '../score-editor/editorProps';
import { flattenInstrumentGroups, pickCommonInstruments } from '../toolbar/instrumentChoices';
import { Button } from '../ui/Button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { invokeCommand } from './invokeCommand';

/**
 * The Instruments tab of the left dock: add an instrument, and show, hide or remove the
 * parts on the score. The ribbon's Instruments menu, moved here; every change runs an
 * `instruments.*` command, so it enforces the same rules and confirms a removal the same way.
 */
export function InstrumentsPanel({
  parts,
  instrumentGroups,
  registry = defaultCommandRegistry,
}: {
  parts: readonly PartSummary[];
  instrumentGroups: readonly InstrumentTemplateGroup[];
  registry?: CommandRegistry;
}) {
  const ctx = useCommandContext(registry);
  const [chosen, setChosen] = useState('');

  const options = useMemo(() => flattenInstrumentGroups(instrumentGroups), [instrumentGroups]);
  const common = useMemo(() => pickCommonInstruments(options), [options]);
  const instrumentId = chosen || options[0]?.id || '';
  const canAdd = registry.isEnabled('instruments.add', ctx);
  const canEdit = registry.isEnabled('instruments.part.toggleVisible', ctx);

  return (
    <div data-testid="instruments-panel" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section className="border-b border-slate-200 p-3">
        <h3 className="mb-2 text-caption font-bold uppercase tracking-wider text-slate-500">Add</h3>
        {options.length === 0 ? (
          <p className="text-sm text-slate-600">Instrument list unavailable.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Select value={instrumentId} onValueChange={setChosen} disabled={!canAdd}>
              <SelectTrigger data-testid="select-instrument-add" className="w-full">
                <SelectValue placeholder="Select instrument" />
              </SelectTrigger>
              <SelectContent>
                {common.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Common</SelectLabel>
                    {common.map((entry) => (
                      <SelectItem key={`common-${entry.instrument.id}`} value={entry.instrument.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {instrumentGroups.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>{group.name}</SelectLabel>
                    {group.instruments.map((instrument) => (
                      <SelectItem key={instrument.id} value={instrument.id}>
                        {instrument.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="btn-add-instrument"
              variant="primary"
              size="sm"
              disabled={!canAdd || !instrumentId}
              onClick={() => void invokeCommand('instruments.add', { instrumentId }, registry)}
            >
              Add Instrument
            </Button>
          </div>
        )}
      </section>
      <section className="p-3">
        <h3 className="mb-2 text-caption font-bold uppercase tracking-wider text-slate-500">
          On Score
        </h3>
        {parts.length === 0 ? (
          <p className="text-sm text-slate-600">No parts loaded.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {parts.map((part) => (
              <li
                key={`${part.index}-${part.instrumentId}`}
                className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                  {part.name || part.instrumentName || part.instrumentId}
                </span>
                <Button
                  data-testid={`btn-part-visible-${part.index}`}
                  variant="ghost"
                  size="xs"
                  disabled={!canEdit}
                  onClick={() =>
                    void invokeCommand(
                      'instruments.part.toggleVisible',
                      { index: part.index },
                      registry,
                    )
                  }
                >
                  {part.isVisible ? 'Hide' : 'Show'}
                </Button>
                <Button
                  data-testid={`btn-part-remove-${part.index}`}
                  variant="ghost"
                  size="xs"
                  disabled={!registry.isEnabled('instruments.part.remove', ctx)}
                  onClick={() =>
                    void invokeCommand('instruments.part.remove', { index: part.index }, registry)
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
