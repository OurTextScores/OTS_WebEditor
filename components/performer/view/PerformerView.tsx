'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  readPedals,
  readPlayThrough,
  writePedals,
  writePlayThrough,
} from '../platform/deviceSettings';
import { AnnotateTools } from '../annotations/AnnotateTools';
import { AnnotationLayer } from '../annotations/AnnotationLayer';
import { resolvePublicScoreUrl } from '../../../lib/public-score-url';
import { SetlistCard } from '../setlists/SetlistCard';
import { useSetlistEdge, type SetlistNav } from '../setlists/useSetlistEdge';
import { useAnnotateMode } from '../annotations/useAnnotateMode';
import { usePerformerRepeats } from '../repeats/usePerformerRepeats';
import { useWakeLock } from '../platform/wakeLock';
import { orientationOf } from '../session/devicePageStyle';
import { usePerformerScore } from '../session/usePerformerScore';
import { halfViewOf } from '../turning/halfPage';
import { PedalSetup } from '../turning/PedalSetup';
import { DEFAULT_PEDALS, type PedalMapping } from '../turning/pedalMapping';
import { step, type TurnEvent, type TurnState } from '../turning/turnMachine';
import { PerformerBar } from './PerformerBar';
import { PerformerPages } from './PerformerPages';
import { viewBoxHeight } from './pageSvgHeight';
import { useAvailableArea } from './useAvailableArea';
import { usePedalKeys } from './usePedalKeys';
import { useSurfacePointer } from './useSurfacePointer';
import { BarExtras } from './BarExtras';
import { useDisplay, useHalfPages } from './useViewChoices';
import { ScreenReaderTurns } from './ScreenReaderTurns';

/** A second turn sooner than this is a bounce or a nervous tap. */
const TURN_DEBOUNCE_MS = 300;

/**
 * Performer mode's page surface: the score laid out for the screen, locked while performing. Pedal keys and taps only
 * turn pages (left third back, elsewhere forward, on touch-down), by whole pages or, with half pages on, by halves
 * split between systems: the top of the next page above the bottom of this one, then the next page. The controls open
 * with a long press near the top or a two-finger tap (Escape on a keyboard).
 */
export function PerformerView({
  scoreUrl,
  setlist = null,
}: {
  scoreUrl: string | null;
  /** In a setlist: a turn past the end of the piece offers the next one. */
  setlist?: SetlistNav | null;
}) {
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
  const edge = useSetlistEdge(setlist, state.status === 'ready', resolvePublicScoreUrl);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [display, setDisplay] = useDisplay();
  const [pedalSetupOpen, setPedalSetupOpen] = useState(false);
  const [half, setHalf] = useState(false);
  const orientation = orientationOf(area);
  const [halfPages, setHalfPages] = useHalfPages(scoreKey, orientation);
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
    if (to.page === from.page && to.half === from.half) {
      edge.atEdge(event); // past the end of a piece: the setlist's next one
      return;
    }
    edge.clear();
    setHalf(to.half);
    if (to.page !== from.page) goToPage(to.page);
  };

  usePedalKeys({
    surface: surfaceRef,
    pedals,
    turn,
    toggleControls: () => setControlsOpen((open) => !open),
  });

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
      data-display={display}
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
      {state.status === 'ready' && (
        <ScreenReaderTurns
          page={state.page}
          pageCount={state.pageCount}
          onTurn={turn}
          onControls={() => setControlsOpen(true)}
        />
      )}
      {edge.card && <SetlistCard card={edge.card} onGo={edge.go} onStay={edge.clear} />}
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
          display={display}
          onDisplay={setDisplay}
          wakeLockNote={wakeLockNote}
          onPart={setPart}
          onStaffScale={setStaffScale}
          onHalfPages={(on) => {
            setHalfPages(on);
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
          extra={<BarExtras score={scoreKey} title={state.title} marks={annotate} />}
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
