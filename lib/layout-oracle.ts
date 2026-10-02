/**
 * The layout oracle (docs/private/VIRITURA_OTS_CROSS_POLLINATION.md §W7.1, O0-1).
 *
 * After an edit the engine has already laid out the changed range incrementally (`endCmd`).
 * `relayout()` is a full-score layout on top of that. If the two give the same SVG, the full
 * layout was wasted work. The oracle checks it: with it on, an edit skips the full relayout,
 * renders the incremental layout, then runs the full layout and compares the page's SVG. A
 * difference means that edit needs a full layout (or that an engine export skips `endCmd`);
 * the label says which edit.
 *
 * Development only. Turn it on with `NEXT_PUBLIC_LAYOUT_ORACLE=1` at build/dev time, or
 * `localStorage['ots.layoutOracle'] = '1'`. Diffs are kept on `window.__otsOracle` and, when
 * `NEXT_PUBLIC_LAYOUT_ORACLE_SINK` names a URL, posted there (`scripts/layout-oracle-sink.mjs`)
 * so a whole Playwright run can be collected in one place.
 */

export interface OracleDiff {
  readonly label: string;
  readonly page: number;
  readonly incrementalBytes: number;
  readonly fullBytes: number;
  /** Offset of the first differing character, and a window of both strings around it. */
  readonly firstDiffAt: number;
  readonly incrementalExcerpt: string;
  readonly fullExcerpt: string;
  readonly pageCountChanged: boolean;
}

interface OracleStore {
  checked: number;
  diffs: OracleDiff[];
  /** Checks and diffs per edit label, so a rate can be read off after a sweep. */
  byLabel: Record<string, { checked: number; diffs: number }>;
}

type OracleWindow = Window & { __otsOracle?: OracleStore };

export function layoutOracleEnabled(): boolean {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return false;
  if (process.env.NEXT_PUBLIC_LAYOUT_ORACLE === '1') return true;
  try {
    return window.localStorage.getItem('ots.layoutOracle') === '1';
  } catch {
    return false;
  }
}

function store(): OracleStore {
  const w = window as OracleWindow;
  return (w.__otsOracle ??= { checked: 0, diffs: [], byLabel: {} });
}

const EXCERPT = 160;

/** `null` when the two SVGs are identical. */
export function compareSvg(
  label: string,
  page: number,
  incremental: string,
  full: string,
  pageCountChanged = false,
): OracleDiff | null {
  if (incremental === full && !pageCountChanged) return null;
  let at = 0;
  const limit = Math.min(incremental.length, full.length);
  while (at < limit && incremental[at] === full[at]) at += 1;
  const from = Math.max(0, at - 40);
  return {
    label,
    page,
    incrementalBytes: incremental.length,
    fullBytes: full.length,
    firstDiffAt: at,
    incrementalExcerpt: incremental.slice(from, from + EXCERPT),
    fullExcerpt: full.slice(from, from + EXCERPT),
    pageCountChanged,
  };
}

/** Records one comparison (diff or not) and forwards a diff to the sink. */
export function recordOracleResult(label: string, diff: OracleDiff | null): void {
  const target = store();
  target.checked += 1;
  const entry = (target.byLabel[label] ??= { checked: 0, diffs: 0 });
  entry.checked += 1;
  if (!diff) return;
  entry.diffs += 1;
  target.diffs.push(diff);
  console.warn(`[layout-oracle] ${diff.label}: incremental != full layout`, diff);
  const sink = process.env.NEXT_PUBLIC_LAYOUT_ORACLE_SINK;
  if (sink) {
    // text/plain with no-cors: no preflight, so a plain Node sink needs no CORS handling.
    void fetch(sink, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      body: JSON.stringify({ at: Date.now(), url: location.pathname + location.search, ...diff }),
    }).catch(() => {});
  }
}

interface OracleScore {
  saveSvg(page: number, background: boolean, highlight: boolean): Promise<string> | string;
  npages?: () => Promise<number> | number;
  relayout?: () => Promise<unknown> | unknown;
}

/**
 * Runs after an edit that skipped the full relayout and rendered the incremental layout: reads
 * that page's SVG, runs the full layout, reads the page again and records any difference under
 * the edit's `label`. The page is then rendered again so the next edit starts from a fully laid
 * out score and a diff can only be this edit's. `run` is the editor's serial queue.
 */
export async function verifyFullLayout(
  score: OracleScore,
  label: string,
  page: number,
  run: <T>(operation: () => Promise<T>) => Promise<T>,
  rerender: () => Promise<unknown>,
): Promise<void> {
  if (!score.relayout) return;
  try {
    const pagesBefore = await run(async () => (await score.npages?.()) ?? 1);
    const incremental = await run(async () => score.saveSvg(page, true, false));
    await run(async () => score.relayout!());
    const pagesAfter = await run(async () => (await score.npages?.()) ?? 1);
    const full = await run(async () => score.saveSvg(Math.min(page, pagesAfter - 1), true, false));
    recordOracleResult(
      label,
      compareSvg(label, page, incremental, full, pagesBefore !== pagesAfter),
    );
    await rerender();
  } catch (err) {
    console.warn('[layout-oracle] check failed', label, err);
  }
}
