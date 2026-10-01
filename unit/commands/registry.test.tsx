import { act, render } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CommandRegistry,
  DEFAULT_COMMAND_CONTEXT,
  UnknownCommandError,
  defineCommand,
  defineFamily,
  useCommandContext,
  useProvideCommandContext,
  useRegisterCommands,
  type AnyCommand,
  type CommandContext,
} from '../../lib/commands';

const ctx = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  ...DEFAULT_COMMAND_CONTEXT,
  ...overrides,
});

const simple = (id: string, run = vi.fn()): AnyCommand => defineCommand({ id, label: id, run });

describe('CommandRegistry', () => {
  it('registers, looks up and lists by id', () => {
    const registry = new CommandRegistry();
    registry.register('global', [simple('a.one'), simple('a.two')]);
    expect(registry.has('a.one')).toBe(true);
    expect(registry.ids()).toEqual(['a.one', 'a.two']);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('throws on a duplicate id in development, leaving nothing half-registered', () => {
    const registry = new CommandRegistry();
    registry.register('global', [simple('a.one')]);
    expect(() => registry.register('global', [simple('b.new'), simple('a.one')])).toThrow(
      /already registered/,
    );
    expect(registry.has('b.new')).toBe(false);
  });

  it('removes exactly what a registration added', () => {
    const registry = new CommandRegistry();
    const removeGlobal = registry.register('global', [simple('g.cmd')]);
    const removeMode = registry.register('mode', [simple('m.cmd')]);
    removeMode();
    expect(registry.ids()).toEqual(['g.cmd']);
    removeGlobal();
    expect(registry.ids()).toEqual([]);
  });

  it('does not remove a command that a later registration replaced', () => {
    const registry = new CommandRegistry();
    const first = registry.register('global', [simple('x')]);
    // Production behaviour: the later registration wins instead of throwing.
    const original = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      registry.register('mode', [simple('x')]);
    } finally {
      vi.stubEnv('NODE_ENV', original ?? 'test');
      warn.mockRestore();
    }
    first();
    expect(registry.has('x')).toBe(true);
  });

  describe('run', () => {
    it('runs the command with the live context and arguments', async () => {
      const registry = new CommandRegistry();
      const run = vi.fn();
      registry.register('global', [defineCommand<{ n: number }>({ id: 'a', label: 'A', run })]);
      registry.setContextSource(() => ctx({ hasScore: true }));
      await expect(registry.run('a', { n: 3 })).resolves.toBe('ran');
      expect(run).toHaveBeenCalledWith(expect.objectContaining({ hasScore: true }), { n: 3 });
    });

    it('awaits an async command', async () => {
      const registry = new CommandRegistry();
      let finished = false;
      registry.register('global', [
        defineCommand({
          id: 'slow',
          label: 'Slow',
          run: async () => {
            await Promise.resolve();
            finished = true;
          },
        }),
      ]);
      await registry.run('slow');
      expect(finished).toBe(true);
    });

    it('reports a disabled command instead of running it', async () => {
      const registry = new CommandRegistry();
      const run = vi.fn();
      registry.register('global', [
        defineCommand({ id: 'needs.score', label: 'N', enabled: (c) => c.hasScore, run }),
      ]);
      await expect(registry.run('needs.score')).resolves.toBe('disabled');
      expect(run).not.toHaveBeenCalled();
    });

    it('throws for an unknown id, because that is always a caller bug', async () => {
      const registry = new CommandRegistry();
      await expect(registry.run('nope')).rejects.toBeInstanceOf(UnknownCommandError);
    });

    it('passes a family its variant argument', async () => {
      const registry = new CommandRegistry();
      const run = vi.fn();
      registry.register('global', [
        defineFamily<number>({
          id: 'add.clef',
          label: 'Clef',
          variants: [{ arg: 20, label: 'Bass', testId: 'btn-clef-20' }],
          run,
        }),
      ]);
      await registry.run('add.clef', 20);
      expect(run).toHaveBeenCalledWith(expect.anything(), 20);
    });
  });

  describe('lazy evaluation and contextVersion', () => {
    it('evaluates enabled only when asked, never on registration or invalidation', () => {
      const registry = new CommandRegistry();
      const enabled = vi.fn(() => true);
      registry.register('global', [defineCommand({ id: 'a', label: 'A', enabled, run: () => {} })]);
      registry.invalidate();
      expect(enabled).not.toHaveBeenCalled();
      registry.isEnabled('a');
      expect(enabled).toHaveBeenCalledTimes(1);
    });

    it('bumps contextVersion and notifies subscribers on every change', () => {
      const registry = new CommandRegistry();
      const listener = vi.fn();
      registry.subscribe(listener);
      const start = registry.contextVersion;
      const remove = registry.register('global', [simple('a')]);
      expect(registry.contextVersion).toBeGreaterThan(start);
      const afterRegister = registry.contextVersion;
      remove();
      expect(registry.contextVersion).toBeGreaterThan(afterRegister);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stops notifying an unsubscribed listener', () => {
      const registry = new CommandRegistry();
      const listener = vi.fn();
      const unsubscribe = registry.subscribe(listener);
      unsubscribe();
      registry.invalidate();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it('describes entries as JSON-safe data evaluated against the live context', () => {
    const registry = new CommandRegistry();
    registry.setContextSource(() => ctx({ noteInput: true }));
    registry.register('global', [
      defineCommand({
        id: 'add.noteInput',
        label: 'Note Input',
        testId: 'btn-note-input',
        shortcut: 'N',
        checked: (c) => c.noteInput,
        run: () => {},
      }),
      defineFamily<number>({
        id: 'add.clef',
        label: 'Clef',
        variants: [{ arg: 0, label: 'Treble', testId: 'btn-clef-0' }],
        run: () => {},
      }),
    ]);
    const list = registry.list();
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    expect(list).toContainEqual(
      expect.objectContaining({ id: 'add.noteInput', checked: true, shortcut: 'N', enabled: true }),
    );
    expect(list).toContainEqual(
      expect.objectContaining({
        id: 'add.clef',
        kind: 'family',
        variants: [{ arg: 0, label: 'Treble', testId: 'btn-clef-0' }],
      }),
    );
  });
});

describe('useRegisterCommands', () => {
  function Host({
    registry,
    label,
    run,
    ids = ['a'],
  }: {
    registry: CommandRegistry;
    label: string;
    run: (label: string) => void;
    ids?: string[];
  }) {
    // A new array of new closures every render, as callers write it.
    useRegisterCommands(
      'global',
      ids.map((id) => defineCommand({ id, label, run: () => run(label) })),
      registry,
    );
    return null;
  }

  it('registers on mount and clears on unmount', () => {
    const registry = new CommandRegistry();
    const view = render(<Host registry={registry} label="one" run={() => {}} />);
    expect(registry.has('a')).toBe(true);
    view.unmount();
    expect(registry.has('a')).toBe(false);
  });

  it('keeps run closures current without re-registering', async () => {
    const registry = new CommandRegistry();
    const ran: string[] = [];
    const record = (label: string) => ran.push(label);
    const view = render(<Host registry={registry} label="first" run={record} />);
    const versionAfterMount = registry.contextVersion;

    view.rerender(<Host registry={registry} label="second" run={record} />);
    view.rerender(<Host registry={registry} label="third" run={record} />);

    // No re-registration, so no churn for subscribers...
    expect(registry.contextVersion).toBe(versionAfterMount);
    // ...yet the command runs the latest closure.
    await registry.run('a');
    expect(ran).toEqual(['third']);
  });

  it('re-registers when the set of ids changes', () => {
    const registry = new CommandRegistry();
    const view = render(<Host registry={registry} label="x" run={() => {}} ids={['a']} />);
    view.rerender(<Host registry={registry} label="x" run={() => {}} ids={['a', 'b']} />);
    expect(registry.ids().sort()).toEqual(['a', 'b']);
    view.rerender(<Host registry={registry} label="x" run={() => {}} ids={['b']} />);
    expect(registry.ids()).toEqual(['b']);
  });

  it('wraps mode-scoped commands the same way and clears them with the mode', () => {
    const registry = new CommandRegistry();
    function Mode() {
      useRegisterCommands('mode', [simple('mode.only')], registry);
      return null;
    }
    function App() {
      const [active, setActive] = useState(true);
      return (
        <>
          <button onClick={() => setActive(false)}>leave</button>
          {active && <Mode />}
        </>
      );
    }
    const view = render(<App />);
    expect(registry.has('mode.only')).toBe(true);
    act(() => view.getByText('leave').click());
    expect(registry.has('mode.only')).toBe(false);
  });

  it('evaluates enabled lazily against the latest closure', async () => {
    const registry = new CommandRegistry();
    function Gated({ allowed }: { allowed: boolean }) {
      useRegisterCommands(
        'global',
        [defineCommand({ id: 'gated', label: 'G', enabled: () => allowed, run: () => {} })],
        registry,
      );
      return null;
    }
    const view = render(<Gated allowed={false} />);
    await expect(registry.run('gated')).resolves.toBe('disabled');
    view.rerender(<Gated allowed={true} />);
    await expect(registry.run('gated')).resolves.toBe('ran');
  });
});

describe('useProvideCommandContext / useCommandContext', () => {
  it('serves the provided context and invalidates only when a field changes', () => {
    const registry = new CommandRegistry();
    function Provider({ value }: { value: CommandContext }) {
      useProvideCommandContext(value, registry);
      return null;
    }
    const view = render(<Provider value={ctx({ hasScore: true })} />);
    expect(registry.getContext().hasScore).toBe(true);

    const version = registry.contextVersion;
    // A new object with the same fields is not a change.
    view.rerender(<Provider value={ctx({ hasScore: true })} />);
    expect(registry.contextVersion).toBe(version);

    view.rerender(<Provider value={ctx({ hasScore: true, noteInput: true })} />);
    expect(registry.contextVersion).toBeGreaterThan(version);
    expect(registry.getContext().noteInput).toBe(true);
  });

  it('falls back to an inert context when nothing is provided, and again after unmount', () => {
    const registry = new CommandRegistry();
    function Provider() {
      useProvideCommandContext(ctx({ hasScore: true }), registry);
      return null;
    }
    expect(registry.getContext()).toEqual(DEFAULT_COMMAND_CONTEXT);
    const view = render(<Provider />);
    view.unmount();
    expect(registry.getContext()).toEqual(DEFAULT_COMMAND_CONTEXT);
  });

  it('re-renders a consumer when the context changes', () => {
    const registry = new CommandRegistry();
    function Provider({ value }: { value: CommandContext }) {
      useProvideCommandContext(value, registry);
      return null;
    }
    function Consumer() {
      const context = useCommandContext(registry);
      return <span data-testid="has-score">{String(context.hasScore)}</span>;
    }
    const view = render(
      <>
        <Provider value={ctx({ hasScore: false })} />
        <Consumer />
      </>,
    );
    expect(view.getByTestId('has-score').textContent).toBe('false');
    view.rerender(
      <>
        <Provider value={ctx({ hasScore: true })} />
        <Consumer />
      </>,
    );
    expect(view.getByTestId('has-score').textContent).toBe('true');
  });

  it('exposes window.__otsCommands outside production and removes it on unmount', async () => {
    const registry = new CommandRegistry();
    registry.register('global', [simple('probe')]);
    function Provider() {
      useProvideCommandContext(ctx(), registry);
      return null;
    }
    const view = render(<Provider />);
    expect(window.__otsCommands).toBeDefined();
    expect(window.__otsCommands?.list().map((entry) => entry.id)).toContain('probe');
    await expect(window.__otsCommands?.run('probe')).resolves.toBe('ran');
    view.unmount();
    expect(window.__otsCommands).toBeUndefined();
  });
});
