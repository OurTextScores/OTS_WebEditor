'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useWakeLock } from '../platform/wakeLock';
import { usePerformerScore } from '../session/usePerformerScore';
import { PerformerBar } from './PerformerBar';
import { turnForKey } from './performerKeys';
import { useAvailableArea } from './useAvailableArea';

/** A second turn sooner than this is a bounce or a nervous tap (Phase 2 makes it a setting). */
const TURN_DEBOUNCE_MS = 300;
/** How long a press in the top band must last to open the controls. */
const LONG_PRESS_MS = 600;
/** The share of the height, from the top, where a long press opens the controls. */
const CONTROLS_BAND = 0.2;

/**
 * Performer mode's page surface (Phase 1): one page of the score laid out for the screen, locked while performing.
 * A tap on the left third turns back, anywhere else forward (on touch-down); page-turn keys (Bluetooth pedals) do the
 * same. The controls open with a long press near the top or a two-finger tap (Escape on a keyboard).
 */
export function PerformerView({ scoreUrl }: { scoreUrl: string | null }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const area = useAvailableArea(surfaceRef);
  const { state, staffScale, goToPage, setPart, setStaffScale } = usePerformerScore(scoreUrl, area);
  const [controlsOpen, setControlsOpen] = useState(false);
  const wakeLock = useWakeLock(state.status === 'ready');
  const lastTurn = useRef(0);
  const pressTimer = useRef<number | undefined>(undefined);

  const turn = (direction: 'next' | 'previous') => {
    const now = performance.now();
    if (now - lastTurn.current < TURN_DEBOUNCE_MS) return;
    lastTurn.current = now;
    goToPage(direction === 'next' ? state.page + 1 : state.page - 1);
  };

  // Keys: on the document (pedals send them to whatever has focus); the surface keeps focus as a fallback for
  // browsers that only deliver keys to a focused element
  const latestTurn = useRef(turn);
  useEffect(() => {
    latestTurn.current = turn;
  });
  useEffect(() => {
    surfaceRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setControlsOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('select, input, textarea, button')) return;
      const direction = turnForKey(event);
      if (!direction) return;
      event.preventDefault();
      latestTurn.current(direction);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (controlsOpen || event.button > 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (y < CONTROLS_BAND) {
      // A long press here opens the controls; a short one is still a turn, on release
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = undefined;
        setControlsOpen(true);
      }, LONG_PRESS_MS);
      return;
    }
    turn(x < 1 / 3 ? 'previous' : 'next');
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pressTimer.current === undefined) return;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
    const rect = event.currentTarget.getBoundingClientRect();
    turn((event.clientX - rect.left) / rect.width < 1 / 3 ? 'previous' : 'next');
  };
  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) setControlsOpen(true);
  };

  const wakeLockNote =
    wakeLock === 'refused' || wakeLock === 'unsupported'
      ? 'The screen may lock: set Auto-Lock to Never in Settings ▸ Display & Brightness.'
      : null;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-white"
      data-testid="performer"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div
        ref={surfaceRef}
        tabIndex={-1}
        data-testid="performer-surface"
        className="relative h-full w-full touch-none outline-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onTouchStart={onTouchStart}
      >
        {state.status === 'loading' && (
          <div className="flex h-full items-center justify-center text-slate-500">
            Opening the score…
          </div>
        )}
        {state.status === 'error' && (
          <div
            role="alert"
            className="flex h-full items-center justify-center px-6 text-center text-red-700"
          >
            {state.error}
          </div>
        )}
        {state.status === 'ready' && state.svg && (
          <div
            data-testid="performer-page-svg"
            data-page={state.page}
            className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            // The engine's SVG, sanitized (sanitizeEngineSvg) before it gets here
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        )}
      </div>
      {controlsOpen && state.status === 'ready' && (
        <PerformerBar
          title={state.title}
          page={state.page}
          pageCount={state.pageCount}
          parts={state.parts}
          part={state.part}
          staffScale={staffScale}
          wakeLockNote={wakeLockNote}
          onPart={setPart}
          onStaffScale={setStaffScale}
          onDone={() => {
            setControlsOpen(false);
            surfaceRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}
