/*
 * Page-turn keys (Phase 1 baseline; Phase 2 adds the configurable pedal mapping and half-page turns). Bluetooth
 * page turners are keyboards: on iPad they mostly send left/right arrows, others Page Up/Down, up/down arrows,
 * Space or Enter. All of them turn pages by default.
 */
export type TurnDirection = 'next' | 'previous';

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

/** The turn a key asks for, or null for any other key (with modifiers it is a shortcut, not a pedal). */
export function turnForKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): TurnDirection | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (NEXT.has(event.key)) return 'next';
  if (PREVIOUS.has(event.key)) return 'previous';
  return null;
}
