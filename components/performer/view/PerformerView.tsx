'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readHalfPages, readPedals, writeHalfPages, writePedals } from '../platform/deviceSettings';
import { useWakeLock } from '../platform/wakeLock';
import { orientationOf } from '../session/devicePageStyle';
import { usePerformerScore } from '../session/usePerformerScore';
import { halfViewOf } from '../turning/halfPage';
import { PedalSetup } from '../turning/PedalSetup';
import { DEFAULT_PEDALS, turnForPedal, type PedalMapping } from '../turning/pedalMapping';
import { step, type TurnEvent, type TurnState } from '../turning/turnMachine';
import { PerformerBar } from './PerformerBar';
import { useAvailableArea } from './useAvailableArea';

/** A second turn sooner than this is a bounce or a nervous tap. */
const TURN_DEBOUNCE_MS = 300;
/** How long a press in the top band must last to open the controls. */
const LONG_PRESS_MS = 600;
/** The share of the height, from the top, where a long press opens the controls. */
const CONTROLS_BAND = 0.2;

/** The page's height in its own coordinates (the SVG's viewBox), for the half-page split. */
function viewBoxHeight(svg: string | null): number | null {
  const match = svg?.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+([\d.]+)"/);
  return match ? Number(match[1]) : null;
}

/** One page's SVG filling the surface, optionally clipped to a horizontal band (fractions of the page's height). */
function PageLayer({
  svg,
  page,
  from = 0,
  to = 1,
  testId,
}: {
  svg: string;
  page: number;
  from?: number;
  to?: number;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      data-page={page}
      className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
      style={
        from > 0 || to < 1
          ? { clipPath: `inset(${from * 100}% 0 ${(1 - to) * 100}% 0)` }
          : undefined
      }
      // The engine's SVG, sanitized (sanitizeEngineSvg) before it gets here
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Performer mode's page surface: the score laid out for the screen, locked while performing. Pedal keys and taps only
 * turn pages (left third back, elsewhere forward, on touch-down), by whole pages or, with half pages on, by halves
 * split between systems: the top of the next page above the bottom of this one, then the next page. The controls open
 * with a long press near the top or a two-finger tap (Escape on a keyboard).
 */
export function PerformerView({ scoreUrl }: { scoreUrl: string | null }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const area = useAvailableArea(surfaceRef);
  const { state, staffScale, goToPage, setPart, setStaffScale } = usePerformerScore(scoreUrl, area);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [pedalSetupOpen, setPedalSetupOpen] = useState(false);
  const [half, setHalf] = useState(false);
  const orientation = orientationOf(area);
  const scoreKey = scoreUrl ?? '';
  const [halfChoice, setHalfChoice] = useState<Record<string, boolean>>({});
  const halfPages = halfChoice[orientation] ?? readHalfPages(scoreKey, orientation);
  const [pedals, setPedals] = useState<PedalMapping>(() => readPedals(DEFAULT_PEDALS));
  const wakeLock = useWakeLock(state.status === 'ready');
  const lastTurn = useRef(0);
  const pressTimer = useRef<number | undefined>(undefined);

  const pageHeight = viewBoxHeight(state.svg);
  const halfView = useMemo(
    () => (pageHeight ? halfViewOf(state.bands, state.page, pageHeight) : null),
    [state.bands, state.page, pageHeight],
  );
  // Shown half turned only while the half view is possible (a relayout or a page change can end it)
  const showingHalf = half && halfPages && Boolean(halfView && state.nextSvg);

  const turn = (event: TurnEvent) => {
    const now = performance.now();
    if (now - lastTurn.current < TURN_DEBOUNCE_MS) return;
    lastTurn.current = now;
    const from: TurnState = { page: state.page, half: showingHalf };
    const to = step(from, event, {
      pageCount: state.pageCount,
      halfPages,
      canHalf: (page) => page === state.page && Boolean(halfView && state.nextSvg),
    });
    setHalf(to.half);
    if (to.page !== from.page) goToPage(to.page);
  };

  // Keys: on the document (pedals send them to whatever has focus); the surface keeps focus as a fallback for
  // browsers that only deliver keys to a focused element
  const latestTurn = useRef(turn);
  const latestPedals = useRef(pedals);
  useEffect(() => {
    latestTurn.current = turn;
    latestPedals.current = pedals;
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
      const direction = turnForPedal(event, latestPedals.current);
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

  const splitAt = halfView && pageHeight ? halfView.split / pageHeight : 0;
  const nextTopAt = halfView && pageHeight ? halfView.nextTop / pageHeight : 0;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-white"
      data-testid="performer"
      data-half={showingHalf ? 'true' : 'false'}
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
        {state.status === 'ready' && state.svg && !showingHalf && (
          <PageLayer svg={state.svg} page={state.page} testId="performer-page-svg" />
        )}
        {state.status === 'ready' && state.svg && showingHalf && state.nextSvg && (
          <>
            {/* The bottom of this page, still being played, and the top of the next above it */}
            <PageLayer
              svg={state.svg}
              page={state.page}
              from={splitAt}
              testId="performer-page-svg"
            />
            <PageLayer
              svg={state.nextSvg}
              page={state.page + 1}
              to={nextTopAt}
              testId="performer-next-top"
            />
            <div
              aria-hidden
              data-testid="performer-half-divider"
              className="pointer-events-none absolute inset-x-0 text-slate-400"
              style={{ top: `${splitAt * 100}%`, borderTop: '2px dashed currentColor' }}
            />
          </>
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
          halfPages={halfPages}
          wakeLockNote={wakeLockNote}
          onPart={setPart}
          onStaffScale={setStaffScale}
          onHalfPages={(on) => {
            writeHalfPages(scoreKey, orientation, on);
            setHalfChoice((previous) => ({ ...previous, [orientation]: on }));
            if (!on) setHalf(false);
          }}
          onPedals={() => setPedalSetupOpen(true)}
          onDone={() => {
            setControlsOpen(false);
            setPedalSetupOpen(false);
            surfaceRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      {pedalSetupOpen && (
        <PedalSetup
          mapping={pedals}
          onChange={(mapping) => {
            writePedals(mapping);
            setPedals(mapping);
          }}
          onClose={() => setPedalSetupOpen(false)}
        />
      )}
    </div>
  );
}
