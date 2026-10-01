import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { resetShellUiForTests } from '../../components/shell/shellStore';
import { useShellShortcuts } from '../../components/shell/useShellShortcuts';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';

beforeEach(() => resetShellUiForTests());

function setup(
  ids: string[] = ['checkpoint.save', 'shell.palette', 'format.flip', 'view.zoom.preset'],
) {
  const registry = new CommandRegistry();
  const spies: Record<string, Mock<(ctx: unknown, arg: unknown) => void>> = {};
  registry.register(
    'global',
    ids.map((id) => {
      spies[id] = vi.fn<(ctx: unknown, arg: unknown) => void>();
      return defineCommand<unknown>({ id, label: id, run: (ctx, arg) => spies[id](ctx, arg) });
    }),
  );
  function Host() {
    useShellShortcuts(registry);
    return (
      <div>
        <input data-testid="field" />
        <div data-testid="canvas" tabIndex={0} />
      </div>
    );
  }
  const view = render(<Host />);
  return { spies, view, registry };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useShellShortcuts', () => {
  it('runs the bound command and stops the browser’s own handling', async () => {
    const { spies, view } = setup();
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    view.getByTestId('canvas').dispatchEvent(event);
    await flush();
    expect(spies['checkpoint.save']).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('passes the shortcut’s argument', async () => {
    const { spies, view } = setup();
    fireEvent.keyDown(view.getByTestId('canvas'), { key: '0', ctrlKey: true });
    await flush();
    expect(spies['view.zoom.preset']).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('works with Command as well as Ctrl', async () => {
    const { spies, view } = setup();
    fireEvent.keyDown(view.getByTestId('canvas'), { key: 's', metaKey: true });
    await flush();
    expect(spies['checkpoint.save']).toHaveBeenCalledOnce();
  });

  it('leaves a typing context alone, except for the palette', async () => {
    const { spies, view } = setup();
    const field = view.getByTestId('field');
    fireEvent.keyDown(field, { key: 'x' });
    fireEvent.keyDown(field, { key: 's', ctrlKey: true });
    await flush();
    expect(spies['format.flip']).not.toHaveBeenCalled();
    expect(spies['checkpoint.save']).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'P', ctrlKey: true, shiftKey: true });
    await flush();
    expect(spies['shell.palette']).toHaveBeenCalledOnce();
  });

  it('ignores a key whose command is not registered, leaving it to the browser', async () => {
    const { view } = setup(['checkpoint.save']);
    const event = new KeyboardEvent('keydown', { key: 'F7', cancelable: true, bubbles: true });
    view.getByTestId('canvas').dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(false);
  });

  it('skips a key someone else already handled', async () => {
    const { spies, view } = setup();
    const event = new KeyboardEvent('keydown', { key: 'x', cancelable: true, bubbles: true });
    event.preventDefault();
    view.getByTestId('canvas').dispatchEvent(event);
    await flush();
    expect(spies['format.flip']).not.toHaveBeenCalled();
  });

  it('does not fire for the wrong modifiers', async () => {
    const { spies, view } = setup();
    fireEvent.keyDown(view.getByTestId('canvas'), { key: 's' });
    fireEvent.keyDown(view.getByTestId('canvas'), { key: 's', ctrlKey: true, shiftKey: true });
    await flush();
    expect(spies['checkpoint.save']).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', async () => {
    const { spies, view } = setup();
    view.unmount();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await flush();
    expect(spies['checkpoint.save']).not.toHaveBeenCalled();
  });
});
