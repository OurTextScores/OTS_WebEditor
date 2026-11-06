import { useRef } from 'react';
import { JUMP_TEXT_SELECTOR, REPEAT_SIGN_SELECTOR } from '../repeats/repeatTap';
import type { TurnEvent } from '../turning/turnMachine';

/** How long a press in the top band must last to open the controls. */
const LONG_PRESS_MS = 600;
/** The share of the height, from the top, where a long press opens the controls. */
const CONTROLS_BAND = 0.2;

/**
 * Taps on the page while performing: a repeat sign jumps (checked first, on touch-down: the music can sit in the top
 * band); a long press near the top or a two-finger tap opens the controls; any other tap turns, back on the left third
 * and forward elsewhere (a short press in the top band turns on release).
 */
export function useSurfacePointer(input: {
  readonly controlsOpen: boolean;
  readonly showingHalf: boolean;
  readonly openControls: () => void;
  readonly turn: (event: TurnEvent) => void;
  readonly jumpOnTap: (onSign: boolean, onJumpText: boolean, fx: number, fy: number) => boolean;
}) {
  const pressTimer = useRef<number | undefined>(undefined);
  const side = (event: React.PointerEvent<HTMLDivElement>): TurnEvent => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width < 1 / 3 ? 'previous' : 'next';
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (input.controlsOpen || event.button > 0) return;
    const pageBox = event.currentTarget
      .querySelector('[data-testid="performer-page-svg"]')
      ?.getBoundingClientRect();
    if (pageBox && !input.showingHalf) {
      const tapped = event.target as Element | null;
      const fx = (event.clientX - pageBox.left) / pageBox.width;
      const fy = (event.clientY - pageBox.top) / pageBox.height;
      if (
        input.jumpOnTap(
          Boolean(tapped?.closest(REPEAT_SIGN_SELECTOR)),
          Boolean(tapped?.closest(JUMP_TEXT_SELECTOR)),
          fx,
          fy,
        )
      ) {
        return;
      }
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if ((event.clientY - rect.top) / rect.height < CONTROLS_BAND) {
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = undefined;
        input.openControls();
      }, LONG_PRESS_MS);
      return;
    }
    input.turn(side(event));
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pressTimer.current === undefined) return;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    input.turn(side(event));
  };
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) input.openControls();
  };
  return { onPointerDown, onPointerUp, onTouchStart };
}
