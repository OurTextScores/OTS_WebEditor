import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BINDINGS, type Binding } from '../../lib/commands/bindings';
import { routeKeydown } from '../../components/shell/keyboard/KeyboardRouter';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import { defineCommand, type CommandContext } from '../../lib/commands/types';

type Spy = Mock<(ctx: unknown, arg: unknown) => void>;

function setup(ctx: Partial<CommandContext> = {}, enabled: Record<string, boolean> = {}) {
  const registry = new CommandRegistry();
  const context: CommandContext = {
    ...DEFAULT_COMMAND_CONTEXT,
    hasScore: true,
    isMutable: true,
    mode: 'write',
    ...ctx,
  };
  registry.setContextSource(() => context);
  const spies: Record<string, Spy> = {};
  const ids = new Set(BINDINGS.map((b) => b.commandId).filter(Boolean) as string[]);
  registry.register(
    'global',
    [...ids].map((id) => {
      spies[id] = vi.fn<(ctx: unknown, arg: unknown) => void>();
      return defineCommand<unknown>({
        id,
        label: id,
        enabled: () => enabled[id] ?? true,
        run: (c, arg) => spies[id](c, arg),
      });
    }),
  );
  return { registry, spies };
}

const keydown = (
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('routeKeydown', () => {
  it('runs the bound command with its argument and takes the key', async () => {
    const { registry, spies } = setup();
    const event = keydown('5');
    expect(routeKeydown(event, registry)).toBe(true);
    await flush();
    expect(spies['edit.duration.set']).toHaveBeenCalledWith(expect.anything(), 4);
    expect(event.defaultPrevented).toBe(true);
  });

  it('passes a family variant argument', async () => {
    const { registry, spies } = setup();
    routeKeydown(keydown('C', { shiftKey: true }), registry);
    await flush();
    expect(spies['add.note.step']).toHaveBeenCalledWith(expect.anything(), {
      step: 0,
      chord: true,
    });
  });

  it('leaves the key to the browser when the command is disabled', () => {
    const { registry, spies } = setup({}, { 'edit.delete': false });
    const event = keydown('Delete');
    expect(routeKeydown(event, registry)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(spies['edit.delete']).not.toHaveBeenCalled();
  });

  it('swallows a key the browser would act on, even when the command is disabled', () => {
    const { registry, spies } = setup({}, { 'edit.undo': false });
    const event = keydown('z', { ctrlKey: true });
    expect(routeKeydown(event, registry)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(spies['edit.undo']).not.toHaveBeenCalled();
  });

  it('uses the note-input meaning of a key only in note input', async () => {
    const normal = setup({ noteInput: false });
    routeKeydown(keydown('s'), normal.registry);
    await flush();
    expect(normal.spies['add.line.slur']).toHaveBeenCalledOnce();

    const input = setup({ noteInput: true });
    expect(routeKeydown(keydown('s'), input.registry)).toBe(false);
    expect(input.spies['add.line.slur']).not.toHaveBeenCalled();
  });

  it('keeps the arrow keys from the page in note input, without acting', () => {
    const { registry, spies } = setup({ noteInput: true });
    const event = keydown('ArrowUp');
    expect(routeKeydown(event, registry)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(spies['edit.pitch.up']).not.toHaveBeenCalled();
  });

  it('moves the pitch with the arrow keys outside note input', async () => {
    const { registry, spies } = setup({ noteInput: false });
    routeKeydown(keydown('ArrowUp'), registry);
    await flush();
    expect(spies['edit.pitch.up']).toHaveBeenCalledOnce();
  });

  it('leaves editing keys to the compare panes, but not the shell keys', async () => {
    const { registry, spies } = setup({ mode: 'compare' });
    expect(routeKeydown(keydown('5'), registry)).toBe(false);
    expect(routeKeydown(keydown('z', { ctrlKey: true }), registry)).toBe(false);
    routeKeydown(keydown('F8'), registry);
    await flush();
    expect(spies['edit.duration.set']).not.toHaveBeenCalled();
    expect(spies['edit.undo']).not.toHaveBeenCalled();
    expect(spies['view.panel.properties']).toHaveBeenCalledOnce();
  });

  it('leaves a text field alone, except for the palette', async () => {
    const { registry, spies } = setup();
    const field = document.createElement('input');
    document.body.append(field);
    expect(routeKeydown(keydown('5', {}, field), registry)).toBe(false);
    expect(routeKeydown(keydown('s', { ctrlKey: true }, field), registry)).toBe(false);
    routeKeydown(keydown('P', { ctrlKey: true, shiftKey: true }, field), registry);
    await flush();
    expect(spies['edit.duration.set']).not.toHaveBeenCalled();
    expect(spies['checkpoint.save']).not.toHaveBeenCalled();
    expect(spies['shell.palette']).toHaveBeenCalledOnce();
  });

  it('leaves everything but the palette to an open dialog', async () => {
    const { registry, spies } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    expect(routeKeydown(keydown('5'), registry)).toBe(false);
    routeKeydown(keydown('P', { ctrlKey: true, shiftKey: true }), registry);
    await flush();
    expect(spies['shell.palette']).toHaveBeenCalledOnce();
  });

  it('does not steal Space from a focused button', async () => {
    const { registry, spies } = setup();
    const button = document.createElement('button');
    document.body.append(button);
    expect(routeKeydown(keydown(' ', {}, button), registry)).toBe(false);
    routeKeydown(keydown(' '), registry);
    await flush();
    expect(spies['playback.playPause']).toHaveBeenCalledOnce();
  });

  it('skips AltGr, composition and keys someone else already handled', () => {
    const { registry } = setup();
    const altGr = keydown('5');
    altGr.getModifierState = (name: string) => name === 'AltGraph';
    expect(routeKeydown(altGr, registry)).toBe(false);
    expect(routeKeydown(keydown('5', { isComposing: true }), registry)).toBe(false);
    const handled = keydown('5');
    handled.preventDefault();
    expect(routeKeydown(handled, registry)).toBe(false);
  });

  it('skips a binding whose command is not registered, and tries the next', async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register('global', [defineCommand({ id: 'second', label: 's', run })]);
    const bindings: Binding[] = [
      { keys: 'Q', commandId: 'first', context: 'edit' },
      { keys: 'Q', commandId: 'second', context: 'global' },
    ];
    expect(routeKeydown(keydown('q'), registry, bindings)).toBe(true);
    await flush();
    expect(run).toHaveBeenCalledOnce();
  });
});
