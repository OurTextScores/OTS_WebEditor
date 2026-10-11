import { readPlayerPreference, writePlayerPreference } from './player-preferences';

/**
 * The listener's playback volume, as a small external store: full until a volume is chosen, remembered once one is.
 *
 * `ots-player-volume`, the first key, is read only to carry a real choice over. It used to be restored with
 * `Number(stored)`, and with nothing stored that is `Number(null)`, which is 0: every first-time listener's player
 * started silent, and the silence was then saved. A "0" under that key therefore says nothing about what the listener
 * wanted and is ignored; any other value can only have come from the slider.
 */
const VOLUME_KEY = 'ots-player-volume-v2';
const LEGACY_VOLUME_KEY = 'ots-player-volume';

export const DEFAULT_VOLUME = 1;

const clampVolume = (volume: number): number => Math.min(1, Math.max(0, volume));

const parseVolume = (stored: string | null): number | null => {
  if (stored === null || stored.trim() === '') return null;
  const value = Number(stored);
  return Number.isFinite(value) ? clampVolume(value) : null;
};

/** The remembered volume, or null when the listener has never chosen one. */
export function readStoredVolume(): number | null {
  const chosen = parseVolume(readPlayerPreference(VOLUME_KEY));
  if (chosen !== null) return chosen;
  const legacy = parseVolume(readPlayerPreference(LEGACY_VOLUME_KEY));
  return legacy !== null && legacy > 0 ? legacy : null;
}

const listeners = new Set<() => void>();
let current: number | null = null;

export const getVolumePreference = (): number =>
  (current ??= readStoredVolume() ?? DEFAULT_VOLUME);
/** Storage cannot be read while rendering on the server, so the server renders the default. */
export const getVolumePreferenceOnServer = (): number => DEFAULT_VOLUME;

export function subscribeVolumePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sets the volume and remembers it. Reading never writes: a player that merely opens leaves storage alone, so it can
 * neither invent a preference nor overwrite one.
 */
export function setVolumePreference(volume: number): void {
  if (!Number.isFinite(volume)) return;
  current = clampVolume(volume);
  writePlayerPreference(VOLUME_KEY, String(current));
  listeners.forEach((listener) => listener());
}

/** For tests: forget the in-memory value so the next read goes to storage. */
export function resetVolumePreferenceForTests(): void {
  current = null;
  listeners.forEach((listener) => listener());
}
