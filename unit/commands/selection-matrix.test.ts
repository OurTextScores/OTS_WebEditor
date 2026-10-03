import { describe, expect, it, vi } from 'vitest';
import { buildEditorCommands } from '../../components/score-editor/editorCommands';
import type { EditorCommandProps } from '../../components/score-editor/editorProps';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import type { CommandContext } from '../../lib/commands/types';

vi.mock('../../components/shell/notices', () => ({ confirmDialog: vi.fn(async () => true) }));

/**
 * The reviewed selection matrix (docs/private/SELECTION_BEHAVIOR_MATRIX.md, "observed" table) as data:
 * for each editor command, is it available for a none / single / list / range selection?
 * Evidence is the engine probe (scripts/selection-matrix-probe.mjs) reviewed against desktop MuseScore;
 * rows marked "bridge" are single-element only because the bridge reads `selection().element()`.
 */
const KINDS = ['none', 'single', 'list', 'range'] as const;

const MATRIX: Array<[id: string, available: [boolean, boolean, boolean, boolean], why?: string]> = [
  ['edit.delete', [false, true, true, true]],
  ['tools.measures.removeSelected', [false, true, false, true], 'a list is refused upstream'],
  ['edit.pitch.up', [false, true, true, true]],
  ['add.line.slur', [false, true, true, true]],
  ['add.line.tie', [false, true, true, true]],
  ['add.line.hairpin', [false, true, true, true]],
  ['format.flip', [false, true, true, true]],
  ['tools.explode', [false, false, false, true], 'range tools'],
  ['tools.implode', [false, false, false, true], 'range tools'],
  ['tools.regroup', [false, false, false, true], 'range tools'],
  [
    'edit.duration.dot',
    [false, true, false, false],
    'bridge: single element only; desktop: every chord and rest',
  ],
  ['add.text.staff', [false, true, false, false], 'bridge: single element only'],
];

function registry(props: Partial<EditorCommandProps>) {
  const full = new Proxy(
    { mutationsEnabled: true, selectionActive: true, ...props } as Record<string, unknown>,
    {
      get: (target, key: string) =>
        key in target ? target[key] : /^on[A-Z]/.test(key) ? vi.fn() : undefined,
    },
  ) as unknown as EditorCommandProps;
  const instance = new CommandRegistry();
  instance.register(
    'global',
    buildEditorCommands(() => full),
  );
  return instance;
}
const context = (
  selection: CommandContext['selection'],
  over: Partial<CommandContext> = {},
): CommandContext => ({
  ...DEFAULT_COMMAND_CONTEXT,
  hasScore: true,
  isMutable: true,
  selection,
  ...over,
});

describe('selection matrix over the real editor commands', () => {
  const instance = registry({});

  it.each(MATRIX)('%s by selection kind', (id, available) => {
    expect(KINDS.map((kind) => instance.isEnabled(id, context(kind)))).toEqual(available);
  });

  it('dynamics and durations (single only in the bridge) are also single only as families', () => {
    for (const id of ['add.mark.dynamic', 'edit.duration.set']) {
      expect(KINDS.map((kind) => instance.isEnabled(id, context(kind)))).toEqual([
        false,
        true,
        false,
        false,
      ]);
    }
  });

  it('a duration can be set from note input without a selection', () => {
    expect(instance.isEnabled('edit.duration.set', context('none', { noteInput: true }))).toBe(
      true,
    );
    expect(instance.isEnabled('edit.duration.dot', context('none', { noteInput: true }))).toBe(
      true,
    );
  });

  it('every gated command is off in a read-only surface, and says so', () => {
    for (const [id] of MATRIX) {
      expect(instance.isEnabled(id, context('single', { isMutable: false }))).toBe(false);
      const row = instance.list().find((entry) => entry.id === id);
      expect(row).toBeDefined();
    }
    const registryReadOnly = registry({});
    registryReadOnly.setContextSource(() => context('single', { isMutable: false }));
    expect(
      registryReadOnly.list().find((entry) => entry.id === 'edit.delete')?.disabledReason,
    ).toBe('This score is read-only here');
  });

  it('lists why a command is unavailable, and nothing for an available one', () => {
    const none = registry({});
    none.setContextSource(() => context('none'));
    expect(
      none.list().find((entry) => entry.id === 'tools.measures.removeSelected')?.disabledReason,
    ).toBe('Select a bar or a range of bars');
    expect(none.list().find((entry) => entry.id === 'add.line.slur')?.disabledReason).toBe(
      'Select something first',
    );
    expect(none.list().find((entry) => entry.id === 'edit.duration.dot')?.disabledReason).toBe(
      'Select a note or rest first',
    );

    const range = registry({});
    range.setContextSource(() => context('range'));
    expect(
      range.list().find((entry) => entry.id === 'tools.explode')?.disabledReason,
    ).toBeUndefined();
    expect(range.list().find((entry) => entry.id === 'add.text.staff')?.disabledReason).toBe(
      'Select a single note or rest',
    );
  });

  it('reports a missing handler as the reason when the selection is fine', () => {
    const bare = new CommandRegistry();
    bare.register(
      'global',
      buildEditorCommands(
        () => ({ mutationsEnabled: true, selectionActive: true }) as EditorCommandProps,
      ),
    );
    bare.setContextSource(() => context('single'));
    expect(bare.list().find((entry) => entry.id === 'add.line.slur')?.disabledReason).toBe(
      'Not available for this score',
    );
  });
});
