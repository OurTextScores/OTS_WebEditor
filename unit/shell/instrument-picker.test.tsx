// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { createContext, useContext, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '../../lib/commands/registry';

// The real select opens through pointer capture, which jsdom does not have. This stands in for
// it with plain elements that keep the one thing under test: which value each option carries.
const SelectContext = createContext<(value: string) => void>(() => {});
vi.mock('../../components/ui/Select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <SelectContext.Provider value={onValueChange}>
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
    const choose = useContext(SelectContext);
    return (
      <button type="button" role="option" aria-selected={false} data-value={value} onClick={() => choose(value)}>
        {children}
      </button>
    );
  },
}));

import { InstrumentsPanel } from '../../components/shell/InstrumentsPanel';
import { commonInstrumentChoice, instrumentIdFromChoice } from '../../components/toolbar/instrumentChoices';

const groups = [
  {
    id: 'strings',
    name: 'Strings',
    instruments: [
      { id: 'violin', name: 'Violin' },
      { id: 'violoncello', name: 'Violoncello' },
      { id: 'viola-da-gamba', name: 'Viola da gamba' },
    ],
  },
];

function panel() {
  const added: string[] = [];
  const registry = new CommandRegistry();
  registry.register('global', [
    {
      id: 'instruments.add',
      label: 'Add Instrument',
      run: (_ctx: unknown, args: { instrumentId: string }) => void added.push(args.instrumentId),
    } as never,
  ]);
  render(<InstrumentsPanel parts={[]} instrumentGroups={groups} registry={registry} />);
  return added;
}

describe('instrument choices', () => {
  it('gives a common entry a value of its own that still names the instrument', () => {
    expect(commonInstrumentChoice('violoncello')).not.toBe('violoncello');
    expect(instrumentIdFromChoice(commonInstrumentChoice('violoncello'))).toBe('violoncello');
    expect(instrumentIdFromChoice('violoncello')).toBe('violoncello');
  });
});

describe('InstrumentsPanel add picker', () => {
  it('never offers two options with the same value', () => {
    // Violin and Violoncello are listed under "Common" and again under "Strings". A select given
    // two options with one value treats both as chosen and shows "VioloncelloVioloncello".
    panel();
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Violin',
      'Violoncello',
      'Violin',
      'Violoncello',
      'Viola da gamba',
    ]);
    const values = options.map((option) => option.getAttribute('data-value'));
    expect(new Set(values).size).toBe(values.length);
  });

  it('adds the instrument that was chosen, from either group', async () => {
    const added = panel();
    const familyCello = screen.getAllByRole('option')[3];

    fireEvent.click(screen.getAllByRole('option')[1]); // Common ▸ Violoncello
    expect(screen.getByTestId('select').getAttribute('data-value')).toBe(commonInstrumentChoice('violoncello'));
    fireEvent.click(screen.getByTestId('btn-add-instrument'));
    await waitFor(() => expect(added).toEqual(['violoncello']));

    fireEvent.click(familyCello); // Strings ▸ Violoncello
    fireEvent.click(screen.getByTestId('btn-add-instrument'));
    await waitFor(() => expect(added).toEqual(['violoncello', 'violoncello']));
  });
});
