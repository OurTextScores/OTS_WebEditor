import { readPlayerPreference, writePlayerPreference } from '../player-preferences';

/**
 * Editor following state as a small external store, read by the header transport, the command registry and the
 * following hook. `followEnabled` is a remembered preference (on by default). `suspended` is per session: manual
 * scrolling or paging while playing sets it, and only Resume following clears it (no timer: a timer could steal the
 * page while someone is inspecting notation). `revealRequests` counts Jump to playback / Resume requests, which the
 * following hook serves once each.
 */
const FOLLOW_KEY = 'ots-editor-follow';

export interface FollowState {
  readonly followEnabled: boolean;
  readonly suspended: boolean;
  /** A playback session is active (playing, paused, count-in or tail): cursor and jump are meaningful. */
  readonly active: boolean;
  /** Page the playback is on when that is not the visible page; null when visible or unknown. */
  readonly playbackPage: number | null;
  /** `segment` or `measure` tracking, or `unavailable` when the engine gave no usable map. */
  readonly tracking: 'segment' | 'measure' | 'unavailable' | null;
  /** Following reached a page that was not prepared in time; the current page stays until it is ready. */
  readonly preparingPage: number | null;
  readonly revealRequests: number;
}

const listeners = new Set<() => void>();
let current: FollowState | null = null;

const initial = (): FollowState => ({
  followEnabled: readPlayerPreference(FOLLOW_KEY) !== '0',
  suspended: false,
  active: false,
  playbackPage: null,
  tracking: null,
  preparingPage: null,
  revealRequests: 0,
});

export const getFollowState = (): FollowState => (current ??= initial());
export const getFollowStateOnServer = (): FollowState => SERVER_STATE;
const SERVER_STATE: FollowState = {
  followEnabled: true,
  suspended: false,
  active: false,
  playbackPage: null,
  tracking: null,
  preparingPage: null,
  revealRequests: 0,
};

export function subscribeFollowState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateFollowState(patch: Partial<FollowState>): void {
  const previous = getFollowState();
  if ((Object.keys(patch) as (keyof FollowState)[]).every((key) => previous[key] === patch[key]))
    return;
  current = { ...previous, ...patch };
  listeners.forEach((listener) => listener());
}

export function setFollowEnabled(enabled: boolean): void {
  writePlayerPreference(FOLLOW_KEY, enabled ? '1' : '0');
  // Turning follow on is an explicit request to follow again.
  updateFollowState({
    followEnabled: enabled,
    suspended: enabled ? false : getFollowState().suspended,
  });
  if (enabled && getFollowState().active) requestReveal();
}

/** Manual scrolling/paging during playback: stop moving the viewport until the user resumes. */
export function suspendFollow(): void {
  const state = getFollowState();
  if (state.active && state.followEnabled && !state.suspended)
    updateFollowState({ suspended: true });
}

/** Reveal the playback location once; following stays suspended if it was. */
export function requestReveal(): void {
  updateFollowState({ revealRequests: getFollowState().revealRequests + 1 });
}

export function resumeFollowing(): void {
  updateFollowState({ suspended: false });
  requestReveal();
}

/** For tests: forget the in-memory value so the next read goes to storage. */
export function resetFollowStateForTests(): void {
  current = null;
  listeners.forEach((listener) => listener());
}
