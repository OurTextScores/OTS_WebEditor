import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEditorCommands,
  deriveRibbonCommandContext,
} from '../../components/score-editor/editorCommands';
import type { ToolbarSectionProps } from '../../components/toolbar/types';
import {
  CommandRegistry,
  isCommandFamily,
  type AnyCommand,
  type CommandContext,
  type CommandFamily,
} from '../../lib/commands';

const confirmDialog = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../components/shell/notices', () => ({ confirmDialog }));

type Handlers = Record<string, ReturnType<typeof vi.fn>>;

/** Props where every `on*` handler is a spy and every capability flag is on. */
function liveProps(overrides: Partial<ToolbarSectionProps> = {}): {
  props: ToolbarSectionProps;
  handlers: Handlers;
} {
  const handlers: Handlers = {};
  const base: Record<string, unknown> = {
    mutationsEnabled: true,
    selectionActive: true,
    exportsEnabled: true,
    pngAvailable: true,
    audioAvailable: true,
    isPlaying: true,
    palettesOpen: false,
    zoomLevel: 1,
    parts: [
      { index: 0, name: 'Piano', instrumentName: 'Piano', instrumentId: 'piano', isVisible: true },
    ],
    ...overrides,
  };
  const props = new Proxy(base, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (/^on[A-Z]/.test(key)) return (handlers[key] ??= vi.fn());
      return undefined;
    },
  }) as unknown as ToolbarSectionProps;
  return { props, handlers };
}

const idle = (props: ToolbarSectionProps) => buildEditorCommands(() => props);

const find = (commands: AnyCommand[], id: string) => {
  const entry = commands.find((command) => command.id === id);
  if (!entry) throw new Error(`No command ${id}`);
  return entry;
};

/** Runs a command the way the registry does, honouring `enabled`. */
async function run(props: ToolbarSectionProps, id: string, args?: unknown) {
  const registry = new CommandRegistry();
  registry.register('global', idle(props));
  registry.setContextSource(() => deriveRibbonCommandContext(props));
  return registry.run(id, args);
}

beforeEach(() => {
  confirmDialog.mockReset();
  confirmDialog.mockResolvedValue(true);
});

describe('buildEditorCommands', () => {
  const commands = idle(liveProps().props);

  it('registers each id once, with labels in action copy', () => {
    const ids = commands.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = commands.map((command) => (command as { label: string }).label);
    // Viritura's rule, adopted: a trailing ellipsis belongs to the menu (`opensDialog`).
    expect(labels.filter((label) => label.endsWith('…') || label.endsWith('...'))).toEqual([]);
    expect(labels.filter((label) => !label.trim())).toEqual([]);
  });

  it('gives every family unique variant test ids', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const entry of commands) {
      if (!isCommandFamily(entry)) continue;
      for (const variant of (entry as unknown as CommandFamily<unknown>).variants) {
        if (!variant.testId) continue;
        if (seen.has(variant.testId))
          clashes.push(`${variant.testId} in ${entry.id} and ${seen.get(variant.testId)}`);
        seen.set(variant.testId, entry.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('never calls a handler just by being built or evaluated', () => {
    const { props, handlers } = liveProps();
    const built = idle(props);
    const ctx = deriveRibbonCommandContext(props);
    for (const entry of built) {
      entry.enabled?.(ctx);
      if (!isCommandFamily(entry))
        (entry as { checked?: (c: CommandContext) => boolean }).checked?.(ctx);
    }
    expect(Object.values(handlers).filter((spy) => spy.mock.calls.length > 0)).toEqual([]);
  });

  it('reads the latest props when it runs, not the props it was built with', async () => {
    let current = liveProps().props;
    const registry = new CommandRegistry();
    registry.register(
      'global',
      buildEditorCommands(() => current),
    );
    registry.setContextSource(() => deriveRibbonCommandContext(current));

    const second = liveProps();
    current = second.props;
    await registry.run('edit.undo');
    expect(second.handlers.onUndo).toHaveBeenCalledOnce();
  });
});

describe('every ribbon handler is reachable from a command', () => {
  /** Handler names in the sections that are DOM or Radix callbacks, not toolbar props. */
  const NOT_TOOLBAR_PROPS = new Set([
    'onClick',
    'onChange',
    'onSelect',
    'onValueChange',
    'onKeyDown',
    'onDragStart',
    'onOpenChange',
  ]);
  /** Referenced by a section only as a fallback for callers that predate onSetTimeSignature. */
  const LEGACY_FALLBACKS = new Set(['onSetTimeSignature44', 'onSetTimeSignature34']);
  /**
   * Called by a dialog the command opens, not by the command itself: `tools.transpose`
   * opens TransposeDialog, which calls `onTransposeEx` with the user's choices.
   */
  const CALLED_BY_DIALOG = new Set(['onTransposeEx']);

  function referencedHandlers(): Set<string> {
    const dir = resolve(__dirname, '../../components/toolbar/sections');
    const names = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.tsx'))) {
      for (const match of readFileSync(resolve(dir, file), 'utf8').matchAll(
        /\bon[A-Z][A-Za-z0-9]*\b/g,
      )) {
        if (
          !NOT_TOOLBAR_PROPS.has(match[0]) &&
          !LEGACY_FALLBACKS.has(match[0]) &&
          !CALLED_BY_DIALOG.has(match[0])
        )
          names.add(match[0]);
      }
    }
    return names;
  }

  it('invokes each handler a ribbon section uses', async () => {
    const { props, handlers } = liveProps();
    const ctx = deriveRibbonCommandContext(props);
    const sampleArgs: Record<string, unknown> = {
      'add.text.tempo': { bpm: 90 },
      'add.measures': { count: 2, target: 'end' },
      'add.pickup': { numerator: 1, denominator: 4 },
      'add.timeSig.custom': { numerator: 3, denominator: 4 },
      'instruments.add': { instrumentId: 'piano' },
      'instruments.part.toggleVisible': { index: 0 },
      'instruments.part.remove': { index: 0 },
      'file.open': new File(['x'], 'a.mscz'),
      'playback.soundfont': new File(['x'], 'a.sf2'),
    };
    vi.stubGlobal('open', vi.fn());
    for (const entry of idle(props)) {
      if (isCommandFamily(entry)) {
        for (const variant of (entry as unknown as CommandFamily<unknown>).variants) {
          await (entry.run as (c: CommandContext, a: unknown) => unknown)(ctx, variant.arg);
        }
      } else {
        await (entry.run as (c: CommandContext, a: unknown) => unknown)(ctx, sampleArgs[entry.id]);
      }
    }
    vi.unstubAllGlobals();

    const called = new Set(
      Object.keys(handlers).filter((name) => handlers[name].mock.calls.length),
    );
    const orphaned = [...referencedHandlers()].filter((name) => !called.has(name));
    expect(
      orphaned,
      'These ribbon handlers have no command, so the menu and palette cannot reach them.',
    ).toEqual([]);
  });
});

describe('gating mirrors the ribbon', () => {
  it('disables selection-bound commands with nothing selected', async () => {
    const { props } = liveProps({ selectionActive: false });
    expect(await run(props, 'add.line.slur')).toBe('disabled');
    expect(await run(props, 'edit.delete')).toBe('disabled');
    expect(await run(props, 'add.mark.dynamic', 8)).toBe('disabled');
  });

  it('disables edits when mutation is off but still allows view commands', async () => {
    const { props, handlers } = liveProps({ mutationsEnabled: false });
    expect(await run(props, 'edit.undo')).toBe('disabled');
    expect(await run(props, 'add.keySig', 2)).toBe('disabled');
    expect(await run(props, 'view.zoom.in')).toBe('ran');
    expect(handlers.onUndo).toBeUndefined();
  });

  it('disables a command whose handler the editor did not supply', async () => {
    const { props } = liveProps();
    const sparse = new Proxy({ ...props } as object, {
      get: (target, key) => (key === 'onAddSlur' ? undefined : Reflect.get(props, key)),
    }) as ToolbarSectionProps;
    expect(await run(sparse, 'add.line.slur')).toBe('disabled');
    expect(await run(sparse, 'add.line.tie')).toBe('ran');
  });

  it('keeps pitch and duration steps out of note input, but lets accidentals through', async () => {
    const { props } = liveProps({ noteInputActive: true, selectionActive: false });
    expect(await run(props, 'edit.pitch.up')).toBe('disabled');
    expect(await run(props, 'edit.duration.shorter')).toBe('disabled');
    expect(await run(props, 'tools.transpose')).toBe('disabled');
    // Note input is an entry point for these even with nothing selected.
    expect(await run(props, 'add.accidental', 3)).toBe('ran');
    expect(await run(props, 'edit.duration.set', 5)).toBe('ran');
  });

  it('only offers input methods while note input is active', async () => {
    expect(await run(liveProps({ noteInputActive: false }).props, 'add.inputMethod', 2)).toBe(
      'disabled',
    );
    expect(await run(liveProps({ noteInputActive: true }).props, 'add.inputMethod', 2)).toBe('ran');
  });

  it('gates exports on a loaded score and on format availability', async () => {
    expect(await run(liveProps({ exportsEnabled: false }).props, 'file.export.pdf')).toBe(
      'disabled',
    );
    expect(await run(liveProps({ pngAvailable: false }).props, 'file.export.png')).toBe('disabled');
    expect(await run(liveProps({ pngAvailable: false }).props, 'file.export.pdf')).toBe('ran');
    expect(await run(liveProps({ audioAvailable: false }).props, 'file.export.audio')).toBe(
      'disabled',
    );
    expect(await run(liveProps({ audioBusy: true }).props, 'file.export.audio')).toBe('disabled');
  });

  it('gates transport the way the Playback section does', async () => {
    const stopped = liveProps({ isPlaying: false, isPaused: false });
    expect(await run(stopped.props, 'playback.stop')).toBe('disabled');
    expect(await run(stopped.props, 'playback.playPause')).toBe('ran');
    // audioBusy is true for the whole of a streamed playback; it only blocks startup.
    expect(
      await run(liveProps({ isPlaying: true, audioBusy: true }).props, 'playback.playPause'),
    ).toBe('ran');
    expect(
      await run(liveProps({ isPlaying: false, audioBusy: true }).props, 'playback.playPause'),
    ).toBe('disabled');
    expect(await run(liveProps({ audioAvailable: false }).props, 'playback.playPause')).toBe(
      'disabled',
    );
  });

  it('derives a context from the ribbon props', () => {
    const ctx = deriveRibbonCommandContext(liveProps({ noteInputActive: true }).props);
    expect(ctx).toMatchObject({
      mode: 'write',
      hasScore: true,
      selection: 'single',
      noteInput: true,
      isMutable: true,
    });
    expect(
      deriveRibbonCommandContext({ selectionActive: false } as ToolbarSectionProps),
    ).toMatchObject({
      hasScore: false,
      selection: 'none',
      isMutable: false,
      canUndo: false,
    });
  });
});

describe('argument handling', () => {
  it('sanitises a tempo like the Apply button', async () => {
    const { props, handlers } = liveProps();
    await run(props, 'add.text.tempo', { bpm: 96.7 });
    await run(props, 'add.text.tempo', { bpm: -5 });
    await run(props, 'add.text.tempo');
    expect(handlers.onAddTempoText.mock.calls).toEqual([[96], [1], [120]]);
  });

  it('defaults insert-measures to one bar after the selection', async () => {
    const { props, handlers } = liveProps({ insertMeasuresDisabled: false });
    await run(props, 'add.measures');
    await run(props, 'add.measures', { count: 3, target: 'end' });
    expect(handlers.onInsertMeasures.mock.calls).toEqual([
      [1, 'after-selection'],
      [3, 'end'],
    ]);
  });

  it('refuses insert-measures when the engine cannot', async () => {
    expect(await run(liveProps({ insertMeasuresDisabled: true }).props, 'add.measures')).toBe(
      'disabled',
    );
  });

  it('maps voice test ids to the engine voice index', async () => {
    const { props, handlers } = liveProps();
    const family = find(idle(props), 'tools.voice') as unknown as CommandFamily<number>;
    expect(family.variants.map((variant) => [variant.testId, variant.arg])).toEqual([
      ['btn-voice-1', 0],
      ['btn-voice-2', 1],
      ['btn-voice-3', 2],
      ['btn-voice-4', 3],
    ]);
    await run(props, 'tools.voice', 2);
    expect(handlers.onSetVoice).toHaveBeenCalledWith(2);
  });

  it('toggles a selection-filter bit from its current state', async () => {
    const on = liveProps({ selectionFilterMask: 0b11 });
    await run(on.props, 'edit.selectionFilter', 1);
    expect(on.handlers.onSetSelectionFilterBit).toHaveBeenCalledWith(1, false);

    const off = liveProps({ selectionFilterMask: 0b10 });
    await run(off.props, 'edit.selectionFilter', 1);
    expect(off.handlers.onSetSelectionFilterBit).toHaveBeenCalledWith(1, true);

    // The ribbon's default mask has every bit on.
    const defaulted = liveProps();
    await run(defaulted.props, 'edit.selectionFilter', 4);
    expect(defaulted.handlers.onSetSelectionFilterBit).toHaveBeenCalledWith(4, false);

    const family = find(idle(on.props), 'edit.selectionFilter') as unknown as CommandFamily<number>;
    expect(family.checked?.(deriveRibbonCommandContext(on.props), 1)).toBe(true);
    expect(family.checked?.(deriveRibbonCommandContext(on.props), 4)).toBe(false);
  });

  it('passes a time signature to the engine with its glyph type', async () => {
    const { props, handlers } = liveProps();
    await run(props, 'add.timeSig', { numerator: 4, denominator: 4, timeSigType: 1 });
    await run(props, 'add.timeSig', { numerator: 7, denominator: 8 });
    expect(handlers.onSetTimeSignature.mock.calls).toEqual([
      [4, 4, 1],
      [7, 8, undefined],
    ]);
  });

  it('rejects a custom time signature the ribbon would have left disabled', async () => {
    const { props, handlers } = liveProps();
    await run(props, 'add.timeSig.custom', { numerator: 5, denominator: 8 });
    expect(handlers.onSetTimeSignature).toHaveBeenCalledWith(5, 8);
    await expect(
      run(props, 'add.timeSig.custom', { numerator: 0, denominator: 4 }),
    ).rejects.toThrow(RangeError);
    await expect(
      run(props, 'add.timeSig.custom', { numerator: 3.5, denominator: 4 }),
    ).rejects.toThrow(RangeError);
  });

  it('opens the header editor at the centre of the window unless given a point', async () => {
    const { props, handlers } = liveProps();
    await run(props, 'add.text.title');
    await run(props, 'add.text.composer', { point: { clientX: 5, clientY: 6 } });
    expect(handlers.onOpenHeaderEditor.mock.calls[0][0]).toBe('title');
    expect(handlers.onOpenHeaderEditor.mock.calls[0][1]).toEqual({
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    });
    expect(handlers.onOpenHeaderEditor).toHaveBeenLastCalledWith('composer', {
      clientX: 5,
      clientY: 6,
    });
  });

  it('opens the transpose dialog through the toolbar-supplied opener', async () => {
    const { props, handlers } = liveProps({ onTransposeEx: vi.fn() });
    await run(props, 'tools.transpose');
    expect(handlers.onOpenTransposeDialog).toHaveBeenCalledOnce();
    // Without the opener (no Toolbar around the commands) it is not offered.
    const bare = new Proxy({ ...props } as object, {
      get: (_t, key) => (key === 'onOpenTransposeDialog' ? undefined : Reflect.get(props, key)),
    }) as ToolbarSectionProps;
    expect(await run(bare, 'tools.transpose')).toBe('disabled');
  });

  it('applies a zoom preset as a fraction of 100%', async () => {
    const { props, handlers } = liveProps();
    const family = find(idle(props), 'view.zoom.preset') as unknown as CommandFamily<number>;
    expect(family.variants.map((variant) => variant.label)).toEqual(['25%', '50%', '75%', '100%']);
    await run(props, 'view.zoom.preset', 0.5);
    expect(handlers.onSetZoom).toHaveBeenCalledWith(0.5);
  });

  describe('part handling', () => {
    it('flips visibility from the current state', async () => {
      const { props, handlers } = liveProps();
      await run(props, 'instruments.part.toggleVisible', { index: 0 });
      expect(handlers.onTogglePartVisible).toHaveBeenCalledWith(0, false);
    });

    it('names a missing part instead of guessing', async () => {
      await expect(run(liveProps().props, 'instruments.part.remove', { index: 9 })).rejects.toThrow(
        /No part with index 9/,
      );
    });

    it('removes a part only after confirmation', async () => {
      const { props, handlers } = liveProps();
      confirmDialog.mockResolvedValueOnce(false);
      await run(props, 'instruments.part.remove', { index: 0 });
      expect(handlers.onRemovePart).not.toHaveBeenCalled();

      await run(props, 'instruments.part.remove', { index: 0 });
      expect(confirmDialog).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Remove Piano?', destructive: true }),
      );
      expect(handlers.onRemovePart).toHaveBeenCalledWith(0);
    });

    it('requires an instrument id to add one', async () => {
      const { props, handlers } = liveProps();
      await expect(run(props, 'instruments.add', {})).rejects.toThrow(RangeError);
      await run(props, 'instruments.add', { instrumentId: 'violin' });
      expect(handlers.onAddPart).toHaveBeenCalledWith('violin');
    });
  });

  it('hands a chosen file to the loader', async () => {
    const { props } = liveProps();
    const onFileUpload = vi.fn();
    const file = new File(['x'], 'score.mscz');
    await run({ ...props, onFileUpload } as ToolbarSectionProps, 'file.open', file);
    expect(onFileUpload).toHaveBeenCalledWith(file);
  });

  it('reports checked state for toggles from the live props', () => {
    const open = liveProps({ palettesOpen: true });
    const palettes = find(idle(open.props), 'view.panel.palettes') as unknown as {
      checked: (ctx: CommandContext) => boolean;
    };
    expect(palettes.checked(deriveRibbonCommandContext(open.props))).toBe(true);
    const noteInput = find(idle(open.props), 'add.noteInput') as unknown as {
      checked: (ctx: CommandContext) => boolean;
    };
    expect(
      noteInput.checked(deriveRibbonCommandContext(liveProps({ noteInputActive: true }).props)),
    ).toBe(true);
    expect(noteInput.checked(deriveRibbonCommandContext(open.props))).toBe(false);
  });
});
