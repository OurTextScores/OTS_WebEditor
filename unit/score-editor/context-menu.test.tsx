import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScoreContextMenu,
  contextFromReport,
  contextMenuFor,
  hitTypeAfterSelect,
  isEditableType,
  keepsSelectionOnRightClick,
  menuTypeFor,
  pointInBoxes,
  svgHitAt,
  type ContextMenuTarget,
  type EngineSelection,
} from '../../components/score-editor/context-menu';
import type { MenuNode } from '../../components/shell/menus';
import { pruneMenuNodes } from '../../components/shell/menuTree';
import {
  closeCommandForm,
  getShellUiState,
  resetShellUiForTests,
} from '../../components/shell/shellStore';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';
import { allCommandsRegistry } from '../helpers/all-commands';

const none: EngineSelection = { kind: 'none', type: null };
const single = (type: string): EngineSelection => ({ kind: 'single', type });
const range: EngineSelection = { kind: 'range', type: null };
const list: EngineSelection = { kind: 'list', type: null };

/** The tree as the user sees it: registered entries only, as `kind:id[:label]` / `[Submenu]`. */
function shape(nodes: readonly MenuNode[]): unknown[] {
  return nodes.map((node) => {
    if (node.kind === 'separator') return '—';
    if (node.kind === 'submenu') return { [node.label]: shape(node.children) };
    if (node.kind === 'item') return node.label ? `${node.id}:${node.label}` : node.id;
    return node.kind;
  });
}

const target = (overrides: Partial<ContextMenuTarget>): ContextMenuTarget => ({
  menuType: 'Note',
  selection: single('Note'),
  editable: true,
  textEditing: false,
  ...overrides,
});

const registered = (t: ContextMenuTarget) => shape(pruneMenuNodes(contextMenuFor(t), allCommandsRegistry()));

describe('which menu a right-click opens (MuseScore selectionType)', () => {
  it('follows the hit element over the selection', () => {
    expect(menuTypeFor('Note', range)).toBe('Note');
    expect(menuTypeFor('Measure', single('Note'))).toBe('Measure');
  });

  it('falls back to the selection: a range is a bar, one element its type, else the page', () => {
    expect(menuTypeFor(null, range)).toBe('Measure');
    expect(menuTypeFor(null, single('StaffText'))).toBe('StaffText');
    expect(menuTypeFor(null, list)).toBe('Page');
    expect(menuTypeFor(null, none)).toBe('Page');
  });

  it('calls the hit a bar when the engine selected a range on blank staff space', () => {
    expect(hitTypeAfterSelect({ type: null, selected: false }, range)).toBe('Measure');
    expect(hitTypeAfterSelect({ type: 'Note', selected: false }, single('Note'))).toBe('Note');
    // A Shift+right-click that extends a range from a note keeps the note's menu.
    expect(hitTypeAfterSelect({ type: 'Note', selected: false }, range)).toBe('Note');
  });
});

describe('selection on right-click (mousePress_considerSelect)', () => {
  it('keeps the selection when the hit is selected or the point is in the selected range', () => {
    expect(keepsSelectionOnRightClick({ type: 'Note', selected: true }, false)).toBe(true);
    expect(keepsSelectionOnRightClick({ type: null, selected: false }, true)).toBe(true);
    expect(keepsSelectionOnRightClick({ type: 'Note', selected: false }, false)).toBe(false);
  });

  it('tests a point against the selection boxes, edges included', () => {
    const boxes = [{ x: 10, y: 10, w: 20, h: 5 }];
    expect(pointInBoxes({ x: 30, y: 15 }, boxes)).toBe(true);
    expect(pointInBoxes({ x: 31, y: 15 }, boxes)).toBe(false);
    expect(pointInBoxes(null, boxes)).toBe(false);
  });

  it('takes the engine’s report as it stands: the hit type, the selection, editability', () => {
    expect(
      contextFromReport({
        hit: { type: 'HairpinSegment', selected: true, editable: true, staffIdx: 0, drumStaff: false, flags: {} },
        selection: { kind: 'single', type: 'HairpinSegment' },
      }),
    ).toEqual({ hitType: 'HairpinSegment', selection: single('HairpinSegment'), editable: true });
    expect(contextFromReport({ hit: null, selection: { kind: 'range', type: null } })).toEqual({
      hitType: null,
      selection: range,
      editable: false,
    });
  });

  it('reads the engine type and selection mark off the SVG, and treats staff lines as blank', () => {
    document.body.innerHTML = `
      <div id="root"><svg>
        <g class="StaffLines"><path id="line" /></g>
        <g class="Note selected"><path id="note" /></g>
        <g class="HairpinSegment"><path id="hairpin" /></g>
        <rect id="paper" />
      </svg></div>`;
    const at = (id: string) => svgHitAt(document.getElementById(id));
    expect(at('note')).toEqual({ type: 'Note', selected: true });
    expect(at('hairpin')).toEqual({ type: 'HairpinSegment', selected: false });
    expect(at('line')).toEqual({ type: null, selected: false });
    expect(at('paper')).toEqual({ type: null, selected: false });
    expect(at('root')).toEqual({ type: null, selected: false });
  });

  it('offers Edit Element except where MuseScore says an element is not editable', () => {
    expect(isEditableType('StaffText')).toBe(true);
    expect(isEditableType('Clef')).toBe(false);
    expect(isEditableType('Measure')).toBe(false);
    expect(isEditableType(null)).toBe(false);
  });
});

describe('menu contents (NotationContextMenuModel), as registered in OTS today', () => {
  it('gives an element the clipboard block, Select, Edit Element and nothing unregistered', () => {
    expect(registered(target({}))).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.swapClipboard',
      'edit.delete',
      { Select: ['edit.select.similar:Similar', 'edit.select.similarStaff:Similar on This Staff'] },
      '—',
      'edit.element',
    ]);
  });

  it('offers Similar in This Range for a range, and only More… (not yet in OTS) for a list', () => {
    expect(registered(target({ selection: range }))).toContainEqual({
      Select: ['edit.select.similarRange:Similar in This Range'],
    });
    expect(JSON.stringify(registered(target({ selection: list })))).not.toContain('Select');
  });

  it('patterns Select ▸ Similar on the right-clicked element', () => {
    const at = { page: 0, x: 12, y: 34 };
    const select = contextMenuFor(target({ similarAt: at })).find(
      (node) => node.kind === 'submenu' && node.label === 'Select',
    );
    expect(select).toMatchObject({
      children: [{ id: 'edit.select.similar', arg: at }, { id: 'edit.select.similarStaff', arg: at }, {}],
    });
  });

  it('stops after the clipboard block while text is being edited', () => {
    expect(registered(target({ textEditing: true }))).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.swapClipboard',
      'edit.delete',
    ]);
  });

  it('leaves Edit Element out for an element that cannot be edited', () => {
    expect(registered(target({ menuType: 'Clef', editable: false }))).not.toContain('edit.element');
  });

  it('carries the right-clicked point to Edit Element', () => {
    const tree = contextMenuFor(target({ editAt: { clientX: 5, clientY: 6 } }));
    expect(tree.find((node) => node.kind === 'item' && node.id === 'edit.element')).toMatchObject({
      arg: { clientX: 5, clientY: 6 },
    });
  });

  it('gives a bar MuseScore’s measure menu, in its order', () => {
    expect(registered(target({ menuType: 'Measure', selection: range, editable: false }))).toEqual([
      'edit.cut',
      'edit.copy',
      'edit.paste',
      'edit.swapClipboard',
      '—',
      'edit.delete:Clear Measures',
      'tools.measures.removeSelected:Delete Measures',
      '—',
      'instruments.staffProperties',
      '—',
      {
        'Insert Measures': [
          'add.measures:After Selection',
          'add.measures:Before Selection',
          '—',
          'add.measures:At Start of Score',
          'add.measures:At End of Score',
        ],
      },
      {
        'Move Measures': [
          'format.measure.toPrevSystem:To Previous System',
          'format.measure.toNextSystem:To Next System',
        ],
      },
      'format.system.fromSelection',
    ]);
  });

  it('has nothing for blank paper until OTS has page settings, so no menu opens', () => {
    expect(registered(target({ menuType: 'Page', selection: none, editable: false }))).toEqual([]);
  });

  it('presets each Insert Measures entry’s position for the form', () => {
    const insert = contextMenuFor(target({ menuType: 'Measure', selection: range }))
      .flatMap((node) => (node.kind === 'submenu' ? node.children : []))
      .filter((node) => node.kind === 'item' && node.id === 'add.measures')
      .map((node) => (node.kind === 'item' ? node.formDefaults?.target : undefined));
    expect(insert).toEqual(['after-selection', 'before-selection', 'beginning', 'end']);
  });
});

describe('the context menu component', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    resetShellUiForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    closeCommandForm();
  });

  const registryWith = (run: (arg: unknown) => void) => {
    const registry = new CommandRegistry();
    registry.register('global', [
      defineCommand({ id: 'edit.copy', label: 'Copy', run: () => run('copy') }),
      defineCommand<unknown>({ id: 'edit.element', label: 'Edit Element', run: (_ctx, arg) => run(arg) }),
      defineCommand<unknown>({
        id: 'add.measures',
        label: 'Insert Measures',
        opensDialog: true,
        run: (_ctx, arg) => run(arg),
      }),
    ]);
    return registry;
  };

  it('runs a command with the argument its entry carries, and closes', async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <ScoreContextMenu
        registry={registryWith(run)}
        onClose={onClose}
        menu={{
          x: 10,
          y: 20,
          nodes: [
            { kind: 'item', id: 'edit.copy' },
            { kind: 'item', id: 'edit.element', arg: { clientX: 1, clientY: 2 } },
          ],
        }}
      />,
    );
    expect(await screen.findByTestId('score-context-menu')).toBeVisible();
    await userEvent.click(screen.getByTestId('context-item-edit.element'));
    expect(run).toHaveBeenCalledWith({ clientX: 1, clientY: 2 });
    expect(onClose).toHaveBeenCalled();
  });

  it('opens a command’s form with the entry’s preset, and keeps relabelled test ids apart', async () => {
    render(
      <ScoreContextMenu
        registry={registryWith(vi.fn())}
        onClose={vi.fn()}
        menu={{
          x: 0,
          y: 0,
          nodes: [
            {
              kind: 'item',
              id: 'add.measures',
              label: 'Before Selection',
              formDefaults: { target: 'before-selection' },
            },
          ],
        }}
      />,
    );
    const entry = await screen.findByTestId('context-item-add.measures-before-selection');
    expect(entry).toHaveTextContent('Before Selection…');
    await act(async () => {
      await userEvent.click(entry);
    });
    expect(getShellUiState().form).toBe('add.measures');
    expect(getShellUiState().formDefaults).toEqual({ target: 'before-selection' });
  });

  it('keeps a click on an entry from reaching the score canvas it is rendered under', async () => {
    const canvasClick = vi.fn();
    const canvasPointerDown = vi.fn();
    render(
      <div onClick={canvasClick} onPointerDown={canvasPointerDown} onMouseDown={canvasPointerDown}>
        <ScoreContextMenu
          registry={registryWith(vi.fn())}
          onClose={vi.fn()}
          menu={{ x: 0, y: 0, nodes: [{ kind: 'item', id: 'edit.copy' }] }}
        />
      </div>,
    );
    await userEvent.click(await screen.findByTestId('context-item-edit.copy'));
    expect(canvasClick).not.toHaveBeenCalled();
    expect(canvasPointerDown).not.toHaveBeenCalled();
  });

  it('renders nothing without a menu', () => {
    render(<ScoreContextMenu registry={registryWith(vi.fn())} onClose={vi.fn()} menu={null} />);
    expect(screen.queryByTestId('score-context-menu')).toBeNull();
  });
});
