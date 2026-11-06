import { useEffect, useRef } from 'react';
import { turnForPedal, type PedalMapping } from '../turning/pedalMapping';
import type { TurnEvent } from '../turning/turnMachine';

/**
 * Pedal keys turn pages: listened for on the document (pedals send them to whatever has focus); the surface keeps focus
 * as a fallback for browsers that only deliver keys to a focused element. Escape toggles the controls. Keys typed into
 * a control are left alone.
 */
export function usePedalKeys(input: {
  readonly surface: React.RefObject<HTMLElement | null>;
  readonly pedals: PedalMapping;
  readonly turn: (event: TurnEvent) => void;
  readonly toggleControls: () => void;
}) {
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  useEffect(() => {
    latest.current.surface.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        latest.current.toggleControls();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('select, input, textarea, button')) return;
      const direction = turnForPedal(event, latest.current.pedals);
      if (!direction) return;
      event.preventDefault();
      latest.current.turn(direction);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
