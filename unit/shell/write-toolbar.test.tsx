// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolStrip } from '../../components/shell/toolbar/strip/ToolStrip';
import {
  resetLastUsedForTests,
  resetStripCollapsedForTests,
} from '../../components/shell/toolbar/strip/stripPersistence';
import { WriteToolbar } from '../../components/shell/toolbar/WriteToolbar';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { needsSelection } from '../../lib/commands/selectionGates';
import { defineFamily, type CommandContext } from '../../lib/commands/types';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
  resetStripCollapsedForTests();
  resetLastUsedForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(context: Partial<CommandContext> = { selection: 'single' }) {
  const duration = vi.fn();
  const accidental = vi.fn();
  const registry = new CommandRegistry();
  registry.setContextSource(() => ({
    ...DEFAULT_COMMAND_CONTEXT,
    hasScore: true,
    isMutable: true,
    ...context,
  }));
  registry.register('global', [
    defineFamily<number>({
      id: 'edit.duration.set',
      label: 'Duration',
      variants: [2, 3, 4, 5, 6, 7].map((arg) => ({ arg, label: String(arg) })),
      enabled: needsSelection,
      run: (_c, arg) => duration(arg),
    }),
    defineFamily<number>({
      id: 'add.accidental',
      label: 'Accidental',
      variants: [0, 1, 2, 3, 4, 5].map((arg) => ({ arg, label: String(arg) })),
      run: (_c, arg) => accidental(arg),
    }),
  ]);
  render(
    <ToolStrip groups={[]} registry={registry}>
      <WriteToolbar registry={registry} />
    </ToolStrip>,
  );
  return { duration, accidental, user: userEvent.setup() };
}

describe('the quick row’s duration and accidental buttons', () => {
  it('start on the quarter note and the sharp, drawn as their glyphs', () => {
    setup();
    expect(screen.getByTestId('dropdown-duration-last')).toHaveAccessibleName('Duration: Quarter');
    expect(screen.getByTestId('dropdown-accidental-last')).toHaveAccessibleName(
      'Accidental: Sharp',
    );
    expect(screen.getByTestId('dropdown-duration-last').querySelector('svg')).toHaveAttribute(
      'data-glyph',
      'E1D5',
    );
    // Outside the strip's roving order: each face is a tab stop of its own, and arrow keys do not walk to it.
    for (const id of ['dropdown-duration-last', 'dropdown-accidental-last']) {
      expect(screen.getByTestId(id)).toHaveAttribute('tabindex', '0');
      expect(screen.getByTestId(id)).not.toHaveAttribute('data-strip-control');
    }
    // One button each, not a row of six.
    expect(screen.queryByTestId('btn-duration-2')).toBeNull();
    expect(screen.queryByTestId('btn-acc-1')).toBeNull();
  });

  it('apply the variant chosen in the menu and then keep it on the face', async () => {
    const { duration, accidental, user } = setup();
    await user.click(screen.getByTestId('dropdown-duration-last'));
    expect(duration).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByTestId('dropdown-duration'));
    expect(await screen.findByTestId('duration-menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('btn-duration-2'));
    expect(duration).toHaveBeenLastCalledWith(3);
    expect(screen.getByTestId('dropdown-duration-last')).toHaveAccessibleName('Duration: Half');
    await user.click(screen.getByTestId('dropdown-duration-last'));
    expect(duration).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByTestId('dropdown-accidental'));
    await user.click(await screen.findByTestId('btn-acc-1'));
    expect(accidental).toHaveBeenLastCalledWith(1);
    expect(screen.getByTestId('dropdown-accidental-last')).toHaveAccessibleName('Accidental: Flat');
  });

  it('do not add an accidental with nothing to put it on', async () => {
    const { accidental, user } = setup({ selection: 'none' });
    const face = screen.getByTestId('dropdown-accidental-last');
    expect(face).toHaveAttribute('aria-disabled', 'true');
    await user.click(face);
    expect(accidental).not.toHaveBeenCalled();
  });
});
