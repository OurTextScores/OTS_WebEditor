/*
 * Which keys turn pages (performer mode, Phase 2). Bluetooth pedals are keyboards and send different keys by model
 * and mode (on iPad mostly left/right arrows); the defaults accept all the common ones, and the performer can teach
 * each pedal its key ("press your next-page pedal"). Stored per device.
 */
import type { TurnEvent } from './turnMachine';

export interface PedalMapping {
  readonly next: readonly string[];
  readonly previous: readonly string[];
}

export const DEFAULT_PEDALS: PedalMapping = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'],
  previous: ['ArrowLeft', 'ArrowUp', 'PageUp'],
};

/** The turn a key asks for under `mapping`, or null (other keys, and any key with a modifier: a shortcut). */
export function turnForPedal(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  mapping: PedalMapping = DEFAULT_PEDALS,
): TurnEvent | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (mapping.next.includes(event.key)) return 'next';
  if (mapping.previous.includes(event.key)) return 'previous';
  return null;
}

/** `mapping` with `key` taught to `turn` (and taken away from the other turn, so one key never means both). */
export function teach(mapping: PedalMapping, turn: TurnEvent, key: string): PedalMapping {
  const without = (keys: readonly string[]) => keys.filter((existing) => existing !== key);
  return turn === 'next'
    ? { next: [key, ...without(mapping.next)], previous: without(mapping.previous) }
    : { next: without(mapping.next), previous: [key, ...without(mapping.previous)] };
}

/** A key's name as a performer reads it. */
export function keyLabel(key: string): string {
  return (
    { ' ': 'Space', ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓' }[key] ?? key
  );
}
