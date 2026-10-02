/**
 * Per-edit timing (docs/private/VIRITURA_OTS_CROSS_POLLINATION.md §W7.1, O0-2).
 *
 * An edit is a chain of awaited phases (the engine mutation, a full relayout, the page count,
 * the SVG round trip, sanitising, `innerHTML`, then the browser's paint). `startPerf` opens a
 * trace and returns a handle: `handle.time` wraps a phase and `handle.end` closes the trace at
 * the first paint after the DOM was updated. Finished traces land on
 * `window.__otsPerf` (and as `performance.measure` entries, so they show in the DevTools
 * performance panel) in development, or when `localStorage['ots.perf']` is `1`; elsewhere the
 * functions do almost nothing, so call sites need no guard.
 *
 * Edits can overlap (key repeat starts the next before the last has painted), so a trace is a
 * handle passed down the call chain, not a global. A render outside an edit (page navigation)
 * is not traced.
 */

export interface PerfPhase {
  readonly name: string;
  readonly ms: number;
}

export interface PerfTrace {
  readonly label: string;
  /** `performance.now()` at the start and at the first paint after the DOM update. */
  readonly startedAt: number;
  endedAt: number;
  readonly phases: PerfPhase[];
  /** Milliseconds from start to first paint. */
  totalMs: number;
}

interface PerfStore {
  last: PerfTrace | null;
  history: PerfTrace[];
}

type PerfWindow = Window & { __otsPerf?: PerfStore };

const MAX_HISTORY = 200;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    return window.localStorage.getItem('ots.perf') === '1';
  } catch {
    return false;
  }
}

function store(): PerfStore {
  const w = window as PerfWindow;
  return (w.__otsPerf ??= { last: null, history: [] });
}

/** One edit's trace. Edits can overlap (key repeat), so each carries its own handle. */
export interface PerfHandle {
  /** Runs `run`, adds its duration to this trace as `name`, and returns its result. */
  time<T>(name: string, run: () => Promise<T> | T): Promise<T>;
  /**
   * Closes the trace at the first paint after now: the caller has already put the new SVG in
   * the DOM, and a frame callback followed by a task is the nearest a page can get to
   * "painted". Safe to call more than once; only the first counts.
   */
  end(): void;
}

const NOOP: PerfHandle = {
  time: async (_name, run) => run(),
  end: () => {},
};

/** Opens a trace for one edit. When tracing is off this is a no-op handle. */
export function startPerf(label: string): PerfHandle {
  if (!enabled()) return NOOP;
  const trace: PerfTrace = { label, startedAt: now(), endedAt: 0, phases: [], totalMs: 0 };
  let closed = false;
  return {
    async time(name, run) {
      const began = now();
      try {
        return await run();
      } finally {
        trace.phases.push({ name, ms: now() - began });
      }
    },
    end() {
      if (closed) return;
      closed = true;
      const rendered = now();
      requestAnimationFrame(() => {
        setTimeout(() => {
          const painted = now();
          trace.phases.push({ name: 'paint', ms: painted - rendered });
          trace.endedAt = painted;
          trace.totalMs = painted - trace.startedAt;
          const target = store();
          target.last = trace;
          target.history.push(trace);
          if (target.history.length > MAX_HISTORY) target.history.shift();
          try {
            performance.measure(`ots:${trace.label}`, { start: trace.startedAt, end: painted });
          } catch {
            // A browser without the options form of measure() loses only the DevTools entry.
          }
        }, 0);
      });
    },
  };
}

/** For a phase run where no edit is being traced: runs it untimed. */
export const noPerf: PerfHandle = NOOP;

/** For tests: forget everything recorded so far. */
export function resetPerf(): void {
  if (typeof window !== 'undefined') (window as PerfWindow).__otsPerf = { last: null, history: [] };
}
