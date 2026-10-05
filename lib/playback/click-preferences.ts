import { useSyncExternalStore } from 'react';
import { readPlayerPreference, writePlayerPreference } from './player-preferences';

/**
 * The metronome and count-in switches, as a small external store so the editor's menu, header and playback code read
 * one value, and so the choice persists (and agrees with the embedded player, which keeps the same two keys).
 */
const CLICK_KEY = 'ots-player-click';
const COUNT_IN_KEY = 'ots-player-countin';

export interface ClickPreferences {
  readonly enabled: boolean;
  readonly countIn: boolean;
}

const listeners = new Set<() => void>();
let current: ClickPreferences | null = null;

const read = (): ClickPreferences => ({
  enabled: readPlayerPreference(CLICK_KEY) === '1',
  countIn: readPlayerPreference(COUNT_IN_KEY) === '1',
});

export const getClickPreferences = (): ClickPreferences => (current ??= read());
export const getClickPreferencesOnServer = (): ClickPreferences => ({
  enabled: false,
  countIn: false,
});

export function subscribeClickPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(next: ClickPreferences): void {
  current = next;
  writePlayerPreference(CLICK_KEY, next.enabled ? '1' : '0');
  writePlayerPreference(COUNT_IN_KEY, next.countIn ? '1' : '0');
  listeners.forEach((listener) => listener());
}

export const setMetronome = (enabled: boolean) => write({ ...getClickPreferences(), enabled });
export const setCountIn = (countIn: boolean) => write({ ...getClickPreferences(), countIn });

/** For tests: forget the in-memory value so the next read goes to storage. */
export function resetClickPreferencesForTests(): void {
  current = null;
  listeners.forEach((listener) => listener());
}

/** The switches, live (re-renders when either changes). */
export const useClickPreferences = (): ClickPreferences =>
  useSyncExternalStore(subscribeClickPreferences, getClickPreferences, getClickPreferencesOnServer);
