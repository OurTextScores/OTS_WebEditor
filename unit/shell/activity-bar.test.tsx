import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityBar } from '../../components/shell/ActivityBar';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';
import {
  EMPTY_SHELL_VIEW,
  resetShellUiForTests,
  setShellView,
} from '../../components/shell/shellStore';

function setup(
  active: 'write' | 'compare' | 'history',
  withCommands = true,
  panels: {
    aiTools?: boolean;
    scoreSource?: boolean;
    aiEnabled?: boolean;
    dockPanel?: 'palettes' | 'instruments' | 'properties' | 'edits' | null;
    palettesVisible?: boolean;
    dock?: boolean;
  } = {},
) {
  resetShellUiForTests();
  setShellView({
    ...EMPTY_SHELL_VIEW,
    aiToolsOpen: Boolean(panels.aiTools),
    musicXmlOpen: Boolean(panels.scoreSource),
    dockPanel: panels.dockPanel ?? null,
    palettesVisible: Boolean(panels.palettesVisible),
  });
  const registry = new CommandRegistry();
  registry.setContextSource(() => ({ ...DEFAULT_COMMAND_CONTEXT, hasScore: true }));
  const runs = {
    write: vi.fn(),
    compare: vi.fn(),
    history: vi.fn(),
    aiTools: vi.fn(),
    scoreSource: vi.fn(),
    palettes: vi.fn(),
    instruments: vi.fn(),
    properties: vi.fn(),
    edits: vi.fn(),
  };
  if (withCommands) {
    registry.register('global', [
      ...(['write', 'compare', 'history'] as const).map((id) =>
        defineCommand({ id: `shell.activity.${id}`, label: id, run: runs[id] }),
      ),
      defineCommand({
        id: 'view.panel.aiTools',
        label: 'AI Tools',
        enabled: () => panels.aiEnabled !== false,
        checked: () => Boolean(panels.aiTools),
        run: runs.aiTools,
      }),
      ...(
        [
          ['palettes', 'view.panel.palettes'],
          ['instruments', 'view.panel.instruments'],
          ['properties', 'view.panel.properties'],
          ['edits', 'view.panel.undoHistory'],
        ] as const
      ).map(([key, id]) =>
        defineCommand({ id, label: key, enabled: () => panels.dock !== false, run: runs[key] }),
      ),
      defineCommand({
        id: 'view.panel.scoreSource',
        label: 'Score Source',
        checked: () => Boolean(panels.scoreSource),
        run: runs.scoreSource,
      }),
    ]);
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

  it('moves focus with the arrow keys down the activities, the dock panels and the panel toggles, wrapping at the ends', () => {
    setup('write');
    const order = [
      'activity-write',
      'activity-compare',
      'activity-history',
      'dock-panel-palettes',
      'dock-panel-instruments',
      'dock-panel-properties',
      'dock-panel-edits',
      'panel-ai-tools',
      'panel-score-source',
    ];
    screen.getByTestId(order[0]).focus();
    for (let i = 1; i < order.length; i += 1) {
      fireEvent.keyDown(screen.getByTestId(order[i - 1]), { key: 'ArrowDown' });
      expect(screen.getByTestId(order[i])).toHaveFocus();
    }
    fireEvent.keyDown(screen.getByTestId('panel-score-source'), { key: 'ArrowDown' });
    expect(screen.getByTestId('activity-write')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('activity-write'), { key: 'ArrowUp' });
    expect(screen.getByTestId('panel-score-source')).toHaveFocus();
  });

  it('disables an activity whose command is not registered', () => {
    setup('write', false);
    expect(screen.getByTestId('activity-history')).toBeDisabled();
  });

  describe('panel toggles', () => {
    it('offers AI Tools and Score source below the activities and the dock panels, named for assistive tech', () => {
      setup('write');
      expect(screen.getByRole('button', { name: 'AI Tools' })).toHaveAttribute('title', 'AI Tools');
      expect(screen.getByRole('button', { name: 'Score source (XML)' })).toBeInTheDocument();
      const bar = screen.getByTestId('activity-bar');
      const buttons = [...bar.querySelectorAll('button')].map((button) => button.dataset.testid);
      expect(buttons).toEqual([
        'activity-write',
        'activity-compare',
        'activity-history',
        'dock-panel-palettes',
        'dock-panel-instruments',
        'dock-panel-properties',
        'dock-panel-edits',
        'panel-ai-tools',
        'panel-score-source',
      ]);
    });

    it('presses each one only while its panel is open, independently of the activity', () => {
      setup('compare', true, { aiTools: true, scoreSource: false });
      expect(screen.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('activity-compare')).toHaveAttribute('aria-pressed', 'true');
    });

    it('follows the panel when it is closed some other way (its own X), without the bar being re-rendered', () => {
      setup('write', true, { aiTools: true, scoreSource: true });
      expect(screen.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'true');
      act(() => setShellView({ ...EMPTY_SHELL_VIEW, aiToolsOpen: false, musicXmlOpen: true }));
      expect(screen.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'true');
      act(() => setShellView({ ...EMPTY_SHELL_VIEW, aiToolsOpen: true, musicXmlOpen: false }));
      expect(screen.getByTestId('panel-ai-tools')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('panel-score-source')).toHaveAttribute('aria-pressed', 'false');
    });

    it('runs the panel command on a click', () => {
      const runs = setup('write');
      fireEvent.click(screen.getByTestId('panel-ai-tools'));
      expect(runs.aiTools).toHaveBeenCalledTimes(1);
      expect(runs.scoreSource).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('panel-score-source'));
      expect(runs.scoreSource).toHaveBeenCalledTimes(1);
    });

    it('disables a panel whose command is unavailable or not registered', () => {
      setup('write', true, { aiEnabled: false });
      expect(screen.getByTestId('panel-ai-tools')).toBeDisabled();
      expect(screen.getByTestId('panel-score-source')).toBeEnabled();
      cleanup();
      setup('write', false);
      expect(screen.getByTestId('panel-ai-tools')).toBeDisabled();
      expect(screen.getByTestId('panel-score-source')).toBeDisabled();
    });
  });

  it('has an icon per dock panel, pressed while it shows, with its shortcut', () => {
    setup('write', true, { dockPanel: 'properties' });
    expect(screen.getByTestId('dock-panel-properties')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dock-panel-instruments')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Properties' })).toHaveAttribute('title', 'Properties (F8)');
    expect(screen.getByRole('button', { name: 'Edits' })).toHaveAttribute('title', 'Edits');
  });

  it('presses Palettes while they are visible, docked or floating', () => {
    setup('write', true, { dockPanel: null, palettesVisible: true });
    expect(screen.getByTestId('dock-panel-palettes')).toHaveAttribute('aria-pressed', 'true');
  });

  it('runs the panel’s command on a click, and disables the icons without a dock', () => {
    const runs = setup('write');
    fireEvent.click(screen.getByTestId('dock-panel-instruments'));
    expect(runs.instruments).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('dock-panel-edits'));
    expect(runs.edits).toHaveBeenCalledTimes(1);
    cleanup();
    setup('history', true, { dock: false });
    expect(screen.getByTestId('dock-panel-palettes')).toBeDisabled();
  });
});
