'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  readHalfPages,
  readPedals,
  readPlayThrough,
  writeHalfPages,
  writePedals,
  writePlayThrough,
} from '../platform/deviceSettings';
import { AnnotateTools } from '../annotations/AnnotateTools';
import { AnnotationLayer } from '../annotations/AnnotationLayer';
import { useAnnotateMode } from '../annotations/useAnnotateMode';
import { usePerformerRepeats } from '../repeats/usePerformerRepeats';
import { useWakeLock } from '../platform/wakeLock';
import { orientationOf } from '../session/devicePageStyle';
import { usePerformerScore } from '../session/usePerformerScore';
import { halfViewOf } from '../turning/halfPage';
import { PedalSetup } from '../turning/PedalSetup';
import { DEFAULT_PEDALS, turnForPedal, type PedalMapping } from '../turning/pedalMapping';
import { step, type TurnEvent, type TurnState } from '../turning/turnMachine';
import { PerformerBar } from './PerformerBar';
import { PerformerPages } from './PerformerPages';
import { viewBoxHeight } from './pageSvgHeight';
import { useAvailableArea } from './useAvailableArea';
import { useSurfacePointer } from './useSurfacePointer';

/** A second turn sooner than this is a bounce or a nervous tap. */
const TURN_DEBOUNCE_MS = 300;

/**
 * Performer mode's page surface: the score laid out for the screen, locked while performing. Pedal keys and taps only
 * turn pages (left third back, elsewhere forward, on touch-down), by whole pages or, with half pages on, by halves
 * split between systems: the top of the next page above the bottom of this one, then the next page. The controls open
 * with a long press near the top or a two-finger tap (Escape on a keyboard).
 */
export function PerformerView({ scoreUrl }: { scoreUrl: string | null }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const area = useAvailableArea(surfaceRef);
  const scoreKey = scoreUrl ?? '';
  const [playThrough, setPlayThrough] = useState(() => readPlayThrough(scoreKey));
  const { state, staffScale, goToPage, goToBar, setPart, setStaffScale } = usePerformerScore(
    scoreUrl,
    area,
    playThrough,
  );
  const repeats = usePerformerRepeats({ state, playThrough, goToBar });
  const annotate = useAnnotateMode({ state, scoreKey, playThrough });
  const [controlsOpen, setControlsOpen] = useState(false);
  const [pedalSetupOpen, setPedalSetupOpen] = useState(false);
  const [half, setHalf] = useState(false);
  const orientation = orientationOf(area);
  const [halfChoice, setHalfChoice] = useState<Record<string, boolean>>({});
  const halfPages = halfChoice[orientation] ?? readHalfPages(scoreKey, orientation);
  const [pedals, setPedals] = useState<PedalMapping>(() => readPedals(DEFAULT_PEDALS));
  const wakeLock = useWakeLock(state.status === 'ready');
  const lastTurn = useRef(0);

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

  const surfacePointer = useSurfacePointer({
    controlsOpen,
    showingHalf,
    openControls: () => setControlsOpen(true),
    turn,
    jumpOnTap: repeats.jumpOnTap,
  });

  const wakeLockNote =
    wakeLock === 'refused' || wakeLock === 'unsupported'
      ? 'The screen may lock: set Auto-Lock to Never in Settings ▸ Display & Brightness.'
      : null;

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
        // Annotating, taps draw (pedals still turn pages)
        onPointerDown={
          annotate.active ? annotate.pointer.onPointerDown : surfacePointer.onPointerDown
        }
        onPointerMove={annotate.active ? annotate.pointer.onPointerMove : undefined}
        onPointerUp={annotate.active ? annotate.pointer.onPointerUp : surfacePointer.onPointerUp}
        onTouchStart={surfacePointer.onTouchStart}
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
          <PerformerPages
            svg={state.svg}
            nextSvg={state.nextSvg}
            page={state.page}
            half={
              showingHalf && halfView && pageHeight
                ? { split: halfView.split / pageHeight, nextTop: halfView.nextTop / pageHeight }
                : null
            }
            flash={repeats.flash}
          />
        )}
        {state.status === 'ready' && state.geometry && !showingHalf && (
          <AnnotationLayer
            geometry={state.geometry}
            drawn={annotate.drawn}
            live={annotate.pointer.live}
          />
        )}
      </div>
      {annotate.active && (
        <AnnotateTools
          mode={annotate}
          onDone={() => {
            annotate.setActive(false);
            surfaceRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      {controlsOpen && state.status === 'ready' && (
        <PerformerBar
          title={state.title}
          page={state.page}
          pageCount={state.pageCount}
          parts={state.parts}
          part={state.part}
          staffScale={staffScale}
          halfPages={halfPages}
          playThrough={playThrough}
          wakeLockNote={wakeLockNote}
          onPart={setPart}
          onStaffScale={setStaffScale}
          onHalfPages={(on) => {
            writeHalfPages(scoreKey, orientation, on);
            setHalfChoice((previous) => ({ ...previous, [orientation]: on }));
            if (!on) setHalf(false);
          }}
          onPlayThrough={(on) => {
            repeats.rememberPlace();
            writePlayThrough(scoreKey, on);
            setHalf(false);
            setPlayThrough(on);
          }}
          onPedals={() => setPedalSetupOpen(true)}
          onAnnotate={() => {
            setControlsOpen(false);
            setHalf(false);
            annotate.setActive(true);
          }}
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
