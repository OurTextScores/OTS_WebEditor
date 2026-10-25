import { readPlayerPreference, writePlayerPreference } from './player-preferences';
import type { PlaybackOptions, PlaybackOptionsRequest } from '../webmscore-loader';

/**
 * Playback speed and written repeats, as a small external store shared by the editor and the embedded player
 * (menus, header transport, player bar). They are local listening preferences: never written into a score, an undo
 * step or a saved file. The engine applies them per loaded score; `PlaybackOptionsStatus` reports what it accepted.
 */
const TEMPO_KEY = 'ots-playback-tempo';
const REPEATS_KEY = 'ots-playback-repeats';

export const MIN_TEMPO_PERCENT = 25;
export const MAX_TEMPO_PERCENT = 200;
export const TEMPO_PRESETS = [50, 75, 100, 125, 150] as const;
export const TEMPO_STEP = 5;

export interface PlaybackOptionPreferences {
  readonly tempoPercent: number;
  readonly playRepeats: boolean;
}

export interface PlaybackOptionsStatus {
  /** Whether the loaded engine supports options; `unknown` until a score has been asked. */
  readonly capability: 'unknown' | 'available' | 'unavailable';
  /** A change is being applied (audio is retired and re-prepared at the same musical place). */
  readonly applying: boolean;
  readonly error: string | null;
}

const DEFAULTS: PlaybackOptionPreferences = { tempoPercent: 100, playRepeats: true };
const IDLE: PlaybackOptionsStatus = { capability: 'unknown', applying: false, error: null };

export const clampTempoPercent = (value: number) =>
  Number.isFinite(value)
    ? Math.min(MAX_TEMPO_PERCENT, Math.max(MIN_TEMPO_PERCENT, Math.round(value)))
    : DEFAULTS.tempoPercent;

const listeners = new Set<() => void>();
let preferences: PlaybackOptionPreferences | null = null;
let status: PlaybackOptionsStatus = IDLE;
const notify = () => listeners.forEach((listener) => listener());

const read = (): PlaybackOptionPreferences => {
  const stored = readPlayerPreference(TEMPO_KEY);
  return {
    tempoPercent: stored === null ? DEFAULTS.tempoPercent : clampTempoPercent(Number(stored)),
    playRepeats: readPlayerPreference(REPEATS_KEY) !== '0',
  };
};

export const getPlaybackOptionPreferences = (): PlaybackOptionPreferences =>
  (preferences ??= read());
export const getPlaybackOptionPreferencesOnServer = (): PlaybackOptionPreferences => DEFAULTS;
export const getPlaybackOptionsStatus = (): PlaybackOptionsStatus => status;
export const getPlaybackOptionsStatusOnServer = (): PlaybackOptionsStatus => IDLE;

export function subscribePlaybackOptions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(next: PlaybackOptionPreferences): void {
  const previous = getPlaybackOptionPreferences();
  if (previous.tempoPercent === next.tempoPercent && previous.playRepeats === next.playRepeats)
    return;
  preferences = next;
  writePlayerPreference(TEMPO_KEY, String(next.tempoPercent));
  writePlayerPreference(REPEATS_KEY, next.playRepeats ? '1' : '0');
  notify();
}

export const setTempoPercent = (percent: number) =>
  write({ ...getPlaybackOptionPreferences(), tempoPercent: clampTempoPercent(percent) });
export const stepTempo = (direction: 1 | -1) =>
  setTempoPercent(getPlaybackOptionPreferences().tempoPercent + direction * TEMPO_STEP);
export const resetTempo = () => setTempoPercent(DEFAULTS.tempoPercent);
export const setPlayRepeats = (playRepeats: boolean) =>
  write({ ...getPlaybackOptionPreferences(), playRepeats });

/** Back to what the engine holds, after a failed change: the controls must not claim an option that is not playing. */
export function adoptAcceptedOptions(accepted: PlaybackOptions): void {
  write({
    tempoPercent: clampTempoPercent(accepted.tempoMultiplier * 100),
    playRepeats: accepted.playRepeats,
  });
}

export function updatePlaybackOptionsStatus(patch: Partial<PlaybackOptionsStatus>): void {
  if (
    (Object.keys(patch) as (keyof PlaybackOptionsStatus)[]).every(
      (key) => status[key] === patch[key],
    )
  )
    return;
  status = { ...status, ...patch };
  notify();
}

export const toOptionsRequest = (value: PlaybackOptionPreferences): PlaybackOptionsRequest => ({
  tempoMultiplier: value.tempoPercent / 100,
  playRepeats: value.playRepeats,
});

/** Whether the engine already plays `value` (null accepted options are the engine defaults). */
export const optionsMatch = (accepted: PlaybackOptions | null, value: PlaybackOptionPreferences) =>
  Math.round((accepted?.tempoMultiplier ?? 1) * 100) === value.tempoPercent &&
  (accepted?.playRepeats ?? true) === value.playRepeats;

/** For tests: forget the in-memory values so the next read goes to storage. */
export function resetPlaybackOptionPreferencesForTests(): void {
  preferences = null;
  status = IDLE;
  notify();
}
