export const PLAYER_MESSAGE_VERSION = 1 as const;

export type PlayerCommandName =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'stop'
  | 'seek'
  | 'set-volume'
  | 'set-follow'
  | 'set-highlight';

export type HighlightMode = 'measure' | 'note';

export type PlayerCommand = {
  type: 'ots-player:command';
  version: typeof PLAYER_MESSAGE_VERSION;
  playerId: string;
  command: PlayerCommandName;
  value?: number | boolean | HighlightMode;
};

const PLAYER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const VALUELESS_COMMANDS = new Set<PlayerCommandName>(['play', 'pause', 'toggle', 'stop']);

export function resolvePlayerId(value: string | null, fallback: string): string {
  return value && PLAYER_ID_PATTERN.test(value) ? value : fallback;
}

export function resolveParentOrigin(value: string | null, sameOrigin: string): string | null {
  if (value === null) return sameOrigin;
  if (!value || value === '*') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' || value !== parsed.origin) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function parsePlayerCommand(
  value: unknown,
  expectedPlayerId: string,
  durationMs: number,
): PlayerCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<PlayerCommand>;
  if (
    candidate.type !== 'ots-player:command' ||
    candidate.version !== PLAYER_MESSAGE_VERSION ||
    candidate.playerId !== expectedPlayerId ||
    typeof candidate.command !== 'string'
  )
    return null;
  const command = candidate.command as PlayerCommandName;
  if (VALUELESS_COMMANDS.has(command)) {
    return typeof candidate.value === 'undefined' ? (candidate as PlayerCommand) : null;
  }
  if (command === 'seek') {
    return typeof candidate.value === 'number' &&
      Number.isFinite(candidate.value) &&
      candidate.value >= 0 &&
      candidate.value <= Math.max(0, durationMs)
      ? (candidate as PlayerCommand)
      : null;
  }
  if (command === 'set-volume') {
    return typeof candidate.value === 'number' &&
      Number.isFinite(candidate.value) &&
      candidate.value >= 0 &&
      candidate.value <= 1
      ? (candidate as PlayerCommand)
      : null;
  }
  if (command === 'set-follow') {
    return typeof candidate.value === 'boolean' ? (candidate as PlayerCommand) : null;
  }
  if (command === 'set-highlight') {
    return candidate.value === 'measure' || candidate.value === 'note'
      ? (candidate as PlayerCommand)
      : null;
  }
  return null;
}
