import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Score, StaffSystemBand } from '../../../lib/webmscore-loader';
import { sanitizeEngineSvg } from '../../../lib/sanitize-svg';
import { pageGeometryOf, type PageGeometry } from '../annotations/pageGeometry';
import { barBoxesOf, type BarBox } from './barBoxes';
import { loadPerformerScore } from './loadPerformerScore';
import { readPart, readStaffScale, writePart, writeStaffScale } from '../platform/deviceSettings';
import { devicePageStyle, orientationOf, type Viewport } from './devicePageStyle';

/*
 * The performer's score (Phase 1): loaded read-only on the worker engine, in a part, laid out for the device, with the
 * current page and its neighbours rendered. Layout and part act on this instance only; nothing is ever saved.
 */

export type PerformerPart = { readonly index: number; readonly name: string };

export interface PerformerScoreState {
  readonly status: 'loading' | 'ready' | 'error';
  /** Counts the scores loaded: a new one (the Play-through view's) is laid out afresh. */
  readonly loads: number;
  readonly error: string | null;
  readonly title: string;
  readonly parts: readonly PerformerPart[];
  readonly part: number;
  readonly pageCount: number;
  readonly page: number;
  readonly svg: string | null;
  /** The next page's SVG once it is prepared (half-page turns show its top), else null. */
  readonly nextSvg: string | null;
  /** Where each part's staves sit in each system of each page (for half-page splits), for the current layout. */
  readonly bands: readonly StaffSystemBand[];
  /** Written bars (measure indices) in playing order; in the Play-through view, bar i shows written bar [i]. */
  readonly playedBars: readonly number[];
  /** Each bar's box on its page, as fractions of the page (for taps on repeat signs and highlighting a bar). */
  readonly bars: readonly BarBox[];
  /** The laid-out music in the page's own units (bars, beats, staff bands), for anchoring annotations. */
  readonly geometry: PageGeometry | null;
}

export type { BarBox };

const INITIAL: PerformerScoreState = {
  status: 'loading',
  loads: 0,
  error: null,
  title: '',
  parts: [],
  part: -1,
  pageCount: 0,
  page: 0,
  svg: null,
  nextSvg: null,
  bands: [],
  playedBars: [],
  bars: [],
  geometry: null,
};

/** One engine call at a time, in order: the worker engine has one score state. */
function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation, operation);
    tail = next.catch(() => {});
    return next;
  };
}

const LAYOUT_DEBOUNCE_MS = 150;

/**
 * Key the component that uses this by `scoreUrl` and `playThrough`: a different score or view starts afresh. With
 * `playThrough` the score shown is the one with its repeats written out (the engine's Unroll repeats).
 */
export function usePerformerScore(
  scoreUrl: string | null,
  viewport: Viewport,
  playThrough = false,
) {
  const [state, setState] = useState<PerformerScoreState>(INITIAL);
  const scoreRef = useRef<Score | null>(null);
  // Stable for the hook's life (a lazy initial state: `serialQueue` makes the queue function)
  const [run] = useState(serialQueue);
  // Rendered pages for the current layout: current, next and previous (a layout or part change clears them)
  const cache = useRef(new Map<number, string>());
  const layoutGeneration = useRef(0);
  const scoreKey = scoreUrl ?? '';

  const renderPage = useCallback(
    async (target: Score, page: number) => {
      const cached = cache.current.get(page);
      if (cached) return cached;
      const svg = sanitizeEngineSvg(await run(() => target.saveSvg(page, true, false)));
      cache.current.set(page, svg);
      return svg;
    },
    [run],
  );

  const show = useCallback(
    async (page: number) => {
      const target = scoreRef.current;
      if (!target) return;
      const generation = layoutGeneration.current;
      const svg = await renderPage(target, page);
      if (generation !== layoutGeneration.current) return;
      setState((previous) => ({
        ...previous,
        page,
        svg,
        nextSvg: cache.current.get(page + 1) ?? null,
      }));
      // The neighbours, ready for the next turn; anything further away is dropped
      for (const key of [...cache.current.keys()])
        if (Math.abs(key - page) > 1) cache.current.delete(key);
      const count = await run(() => Promise.resolve(target.npages?.() ?? 1));
      for (const neighbour of [page + 1, page - 1]) {
        if (neighbour >= 0 && neighbour < count && generation === layoutGeneration.current) {
          void renderPage(target, neighbour)
            .then((rendered) => {
              if (neighbour !== page + 1 || generation !== layoutGeneration.current) return;
              setState((previous) =>
                previous.page === page ? { ...previous, nextSvg: rendered } : previous,
              );
            })
            .catch(() => {});
        }
      }
    },
    [renderPage, run],
  );

  // Load
  useEffect(() => {
    if (!scoreUrl) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await loadPerformerScore(scoreUrl, playThrough, run, controller.signal);
        if (!loaded) return;
        const { score: active, playedBars } = loaded;
        scoreRef.current = active;
        const metadata = await run(() => active.metadata()).catch(
          () => ({}) as Record<string, unknown>,
        );
        const excerpts = await run(() => Promise.resolve(active.listExcerpts?.() ?? [])).catch(
          () => [],
        );
        const savedPart = readPart(scoreUrl);
        setState((previous) => ({
          ...previous,
          title:
            typeof metadata.title === 'string' && metadata.title
              ? metadata.title
              : 'Untitled score',
          parts: excerpts.map((excerpt, index) => ({ index, name: excerpt.name })),
          part: savedPart >= 0 && savedPart < excerpts.length ? savedPart : -1,
          playedBars,
          status: 'ready',
          loads: previous.loads + 1,
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          ...INITIAL,
          status: 'error',
          error: error instanceof Error ? error.message : 'The score could not be opened.',
        });
      }
    })();
    return () => {
      controller.abort();
      scoreRef.current?.destroy();
      scoreRef.current = null;
    };
  }, [scoreUrl, playThrough, run]);

  // The staff size: chosen on this visit, else remembered for this score and orientation on this device
  const orientation = orientationOf(viewport);
  const [chosenScale, setChosenScale] = useState<Record<string, number>>({});
  const staffScale = chosenScale[orientation] ?? readStaffScale(scoreKey, orientation);

  // Where the reader is, for keeping their place across a relayout (read when the layout changes, not tracked)
  const position = useRef({ page: 0, pageCount: 0 });
  useLayoutEffect(() => {
    position.current = { page: state.page, pageCount: state.pageCount };
  });

  // Lay out for the device whenever the part, the size or the viewport changes (debounced for rotation and resize)
  const { status, part, loads } = state;
  useEffect(() => {
    const target = scoreRef.current;
    if (status !== 'ready' || !target) return;
    const generation = ++layoutGeneration.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const { page: before, pageCount: countBefore } = position.current;
        const anchorFraction = countBefore > 1 ? before / (countBefore - 1) : 0;
        await run(() => Promise.resolve(target.setExcerptId?.(part)));
        const style = devicePageStyle(viewport, staffScale);
        if (style) await run(() => Promise.resolve(target.setStyleValues?.(style)));
        if (generation !== layoutGeneration.current) return;
        cache.current.clear();
        const pageCount = await run(() => Promise.resolve(target.npages?.() ?? 1));
        // Keep roughly the same place in the piece after a relayout
        const page = Math.min(
          pageCount - 1,
          Math.round(anchorFraction * Math.max(0, pageCount - 1)),
        );
        const bands = await run(() => Promise.resolve(target.staffSystemBands?.() ?? [])).catch(
          () => [],
        );
        const positions = await run(() => target.measurePositions()).catch(() => null);
        if (generation !== layoutGeneration.current) return;
        const segments = await run(() => target.segmentPositions()).catch(() => null);
        if (generation !== layoutGeneration.current) return;
        const bars = barBoxesOf(positions);
        const geometry = pageGeometryOf(positions, segments, Array.isArray(bands) ? bands : []);
        setState((previous) => ({
          ...previous,
          pageCount,
          bands: Array.isArray(bands) ? bands : [],
          bars,
          geometry,
        }));
        await show(page);
      })();
    }, LAYOUT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [status, loads, part, staffScale, viewport, run, show]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 0 || page >= state.pageCount || page === state.page) return;
      void show(page);
    },
    [show, state.page, state.pageCount],
  );

  /** Turns to the page that holds `bar` (a measure index of the score shown). */
  const goToBar = useCallback(
    (bar: number) => {
      const box = state.bars.find((candidate) => candidate.index === bar);
      if (box && box.page !== state.page) void show(box.page);
    },
    [show, state.bars, state.page],
  );

  const setPart = useCallback(
    (next: number) => {
      writePart(scoreKey, next);
      setState((previous) => ({ ...previous, part: next }));
    },
    [scoreKey],
  );

  const setStaffScale = useCallback(
    (next: number) => {
      writeStaffScale(scoreKey, orientation, next);
      setChosenScale((previous) => ({ ...previous, [orientation]: next }));
    },
    [scoreKey, orientation, setChosenScale],
  );

  const shown: PerformerScoreState = scoreUrl
    ? state
    : { ...INITIAL, status: 'error', error: 'No score was given to perform.' };
  return { state: shown, staffScale, goToPage, goToBar, setPart, setStaffScale };
}
