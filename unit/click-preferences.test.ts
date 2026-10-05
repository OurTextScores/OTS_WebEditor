// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getClickPreferences,
  resetClickPreferencesForTests,
  setCountIn,
  setMetronome,
  subscribeClickPreferences,
} from '../lib/playback/click-preferences';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../lib/commands/registry';
import { buildShellOwnCommands } from '../components/shell/shellCommands';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetClickPreferencesForTests();
});

describe('click preferences', () => {
  it('start off, and remember each switch separately across a reload', () => {
    expect(getClickPreferences()).toEqual({ enabled: false, countIn: false });
    setMetronome(true);
    setCountIn(true);
    expect(window.localStorage.getItem('ots-player-click')).toBe('1');
    expect(window.localStorage.getItem('ots-player-countin')).toBe('1');
    resetClickPreferencesForTests();
    expect(getClickPreferences()).toEqual({ enabled: true, countIn: true });
    setMetronome(false);
    expect(getClickPreferences()).toEqual({ enabled: false, countIn: true });
  });

  it('tells subscribers when a switch changes, and not after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClickPreferences(listener);
    setMetronome(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    setCountIn(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('hold for the session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    resetClickPreferencesForTests();
    expect(() => setMetronome(true)).not.toThrow();
    expect(getClickPreferences().enabled).toBe(true);
  });
});

describe('the Metronome and Count-in commands', () => {
  const setup = () => {
    const registry = new CommandRegistry();
    registry.setContextSource(() => ({ ...DEFAULT_COMMAND_CONTEXT }));
    registry.register('global', buildShellOwnCommands());
    const state = (id: string) => registry.list().find((entry) => entry.id === id);
    return { registry, state };
  };

  it('toggle the metronome, shown as checked', async () => {
    const { registry, state } = setup();
    expect(state('playback.metronome')?.checked).toBe(false);
    await registry.run('playback.metronome');
    expect(getClickPreferences().enabled).toBe(true);
    expect(state('playback.metronome')?.checked).toBe(true);
    await registry.run('playback.metronome');
    expect(getClickPreferences().enabled).toBe(false);
  });

  it('allow the count-in only while the metronome is on', async () => {
    const { registry, state } = setup();
    expect(state('playback.countIn')?.enabled).toBe(false);
    await registry.run('playback.metronome');
    expect(state('playback.countIn')?.enabled).toBe(true);
    await registry.run('playback.countIn');
    expect(state('playback.countIn')?.checked).toBe(true);
  });
});
