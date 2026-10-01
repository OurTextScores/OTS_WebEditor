import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { CommandFormDialog } from '../../components/shell/CommandFormDialog';
import { COMMAND_FORMS } from '../../components/shell/commandForms';
import { invokeCommand } from '../../components/shell/invokeCommand';
import { NoticeHost, clearNotices, getNoticeSnapshot } from '../../components/shell/notices';
import {
  closeCommandForm,
  getShellUiState,
  resetShellUiForTests,
} from '../../components/shell/shellStore';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';

beforeEach(() => {
  resetShellUiForTests();
  clearNotices();
});
afterEach(() => closeCommandForm());

const withCommands = (...ids: string[]) => {
  const registry = new CommandRegistry();
  const spies: Record<string, Mock<(ctx: unknown, arg: unknown) => void>> = {};
  registry.register(
    'global',
    ids.map((id) => {
      spies[id] = vi.fn<(ctx: unknown, arg: unknown) => void>();
      return defineCommand<unknown>({ id, label: id, run: (ctx, arg) => spies[id](ctx, arg) });
    }),
  );
  return { registry, spies };
};

describe('COMMAND_FORMS', () => {
  it('turn entered text into the arguments the commands take', () => {
    expect(COMMAND_FORMS['add.text.tempo'].toArgs({ bpm: '96' })).toEqual({ bpm: 96 });
    expect(COMMAND_FORMS['add.text.tempo'].toArgs({ bpm: '' })).toEqual({ bpm: 120 });
    expect(COMMAND_FORMS['add.measures'].toArgs({ count: '3', target: 'end' })).toEqual({
      count: 3,
      target: 'end',
    });
    expect(COMMAND_FORMS['add.pickup'].toArgs({ numerator: '3', denominator: '8' })).toEqual({
      numerator: 3,
      denominator: 8,
    });
    expect(
      COMMAND_FORMS['add.timeSig.custom'].toArgs({ numerator: '7', denominator: '8' }),
    ).toEqual({
      numerator: 7,
      denominator: 8,
    });
  });

  it('never produces an argument below one', () => {
    expect(COMMAND_FORMS['add.measures'].toArgs({ count: '-4', target: 'end' })).toEqual({
      count: 1,
      target: 'end',
    });
    expect(COMMAND_FORMS['add.text.tempo'].toArgs({ bpm: '0' })).toEqual({ bpm: 1 });
  });

  it('use test ids that cannot collide with the ribbon’s inputs', () => {
    const ids = Object.values(COMMAND_FORMS).flatMap((form) => form.fields.map((f) => f.testId));
    expect(ids.every((id) => id.startsWith('command-form-'))).toBe(true);
    // A form's own fields must be distinct from each other.
    for (const form of Object.values(COMMAND_FORMS)) {
      const own = form.fields.map((f) => f.testId);
      expect(new Set(own).size).toBe(own.length);
    }
  });
});

describe('invokeCommand', () => {
  it('runs a command directly when it has the arguments', async () => {
    const { registry, spies } = withCommands('add.measures');
    await invokeCommand('add.measures', { count: 2, target: 'end' }, registry);
    expect(spies['add.measures']).toHaveBeenCalledWith(expect.anything(), {
      count: 2,
      target: 'end',
    });
    expect(getShellUiState().form).toBeNull();
  });

  it('asks for the arguments when a command needs them and none were given', async () => {
    const { registry, spies } = withCommands('add.measures');
    await invokeCommand('add.measures', undefined, registry);
    expect(getShellUiState().form).toBe('add.measures');
    expect(spies['add.measures']).not.toHaveBeenCalled();
  });

  it('runs a command that takes no arguments straight away', async () => {
    const { registry, spies } = withCommands('edit.undo');
    await invokeCommand('edit.undo', undefined, registry);
    expect(spies['edit.undo']).toHaveBeenCalledOnce();
  });

  it('turns a failure into a notice, not an unhandled rejection', async () => {
    const registry = new CommandRegistry();
    registry.register('global', [
      defineCommand({
        id: 'edit.undo',
        label: 'Undo',
        run: () => {
          throw new Error('engine said no');
        },
      }),
    ]);
    await expect(invokeCommand('edit.undo', undefined, registry)).resolves.toBeUndefined();
    expect(getNoticeSnapshot().notices.at(-1)).toMatchObject({
      kind: 'error',
      title: 'Unable to undo',
      detail: 'engine said no',
    });
  });

  it('reports an unknown id the same way', async () => {
    await invokeCommand('no.such', undefined, new CommandRegistry());
    expect(getNoticeSnapshot().notices.at(-1)).toMatchObject({ kind: 'error' });
  });
});

describe('CommandFormDialog', () => {
  it('shows the form with the ribbon’s defaults, and runs the command with what was entered', async () => {
    const user = userEvent.setup();
    const { registry, spies } = withCommands('add.measures');
    render(<CommandFormDialog registry={registry} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => void invokeCommand('add.measures', undefined, registry));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Insert Measures');
    const count = screen.getByTestId('command-form-count');
    expect(count).toHaveValue(1);
    expect(screen.getByTestId('command-form-target')).toHaveValue('after-selection');

    await user.clear(count);
    await user.type(count, '4');
    await user.selectOptions(screen.getByTestId('command-form-target'), 'end');
    await user.click(screen.getByTestId('command-form-submit'));

    expect(spies['add.measures']).toHaveBeenCalledWith(expect.anything(), {
      count: 4,
      target: 'end',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const { registry, spies } = withCommands('add.text.tempo');
    render(<CommandFormDialog registry={registry} />);
    act(() => void invokeCommand('add.text.tempo', undefined, registry));
    const bpm = await screen.findByTestId('command-form-bpm');
    await user.clear(bpm);
    await user.type(bpm, '88{Enter}');
    expect(spies['add.text.tempo']).toHaveBeenCalledWith(expect.anything(), { bpm: 88 });
  });

  it('cancels without running anything', async () => {
    const user = userEvent.setup();
    const { registry, spies } = withCommands('add.pickup');
    render(<CommandFormDialog registry={registry} />);
    act(() => void invokeCommand('add.pickup', undefined, registry));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(spies['add.pickup']).not.toHaveBeenCalled();
    expect(getShellUiState().form).toBeNull();
  });

  it('starts from the defaults each time it opens', async () => {
    const user = userEvent.setup();
    const { registry } = withCommands('add.text.tempo');
    render(<CommandFormDialog registry={registry} />);
    act(() => void invokeCommand('add.text.tempo', undefined, registry));
    const bpm = await screen.findByTestId('command-form-bpm');
    await user.clear(bpm);
    await user.type(bpm, '60');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => void invokeCommand('add.text.tempo', undefined, registry));
    expect(await screen.findByTestId('command-form-bpm')).toHaveValue(120);
  });

  it('surfaces a failure from the submitted command as a notice', async () => {
    const user = userEvent.setup();
    const registry = new CommandRegistry();
    registry.register('global', [
      defineCommand<unknown>({
        id: 'add.timeSig.custom',
        label: 'Custom Time Signature',
        run: () => {
          throw new RangeError('bad signature');
        },
      }),
    ]);
    render(
      <>
        <CommandFormDialog registry={registry} />
        <NoticeHost />
      </>,
    );
    act(() => void invokeCommand('add.timeSig.custom', undefined, registry));
    await user.click(await screen.findByTestId('command-form-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('bad signature');
  });
});
