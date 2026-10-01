import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityBar } from '../../components/shell/ActivityBar';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';

function setup(active: 'write' | 'compare' | 'history', withCommands = true) {
  const registry = new CommandRegistry();
  registry.setContextSource(() => ({ ...DEFAULT_COMMAND_CONTEXT, hasScore: true }));
  const runs = { write: vi.fn(), compare: vi.fn(), history: vi.fn() };
  if (withCommands) {
    registry.register(
      'global',
      (['write', 'compare', 'history'] as const).map((id) =>
        defineCommand({ id: `shell.activity.${id}`, label: id, run: runs[id] }),
      ),
    );
  }
  render(<ActivityBar active={active} registry={registry} />);
  return runs;
}

describe('ActivityBar', () => {
  it('presses only the active activity', () => {
    setup('history');
    expect(screen.getByTestId('activity-history')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('activity-write')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('activity-compare')).toHaveAttribute('aria-pressed', 'false');
  });

  it('runs the activity command on a click', () => {
    const runs = setup('write');
    fireEvent.click(screen.getByTestId('activity-history'));
    expect(runs.history).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('activity-compare'));
    expect(runs.compare).toHaveBeenCalledTimes(1);
  });

  it('names each button for assistive tech and as a tooltip', () => {
    setup('write');
    for (const label of ['Write', 'Compare', 'History']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveAttribute('title', label);
    }
  });

  it('moves focus with the arrow keys, wrapping at the ends', () => {
    setup('write');
    const write = screen.getByTestId('activity-write');
    write.focus();
    fireEvent.keyDown(write, { key: 'ArrowDown' });
    expect(screen.getByTestId('activity-compare')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('activity-compare'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByTestId('activity-history'), { key: 'ArrowDown' });
    expect(write).toHaveFocus();
    fireEvent.keyDown(write, { key: 'ArrowUp' });
    expect(screen.getByTestId('activity-history')).toHaveFocus();
  });

  it('disables an activity whose command is not registered', () => {
    setup('write', false);
    expect(screen.getByTestId('activity-history')).toBeDisabled();
  });
});
