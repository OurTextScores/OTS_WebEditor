import type { MutableRefObject } from 'react';
import type { Score } from '../../../lib/webmscore-loader';
import { PageSvgCache } from './pageSvgCache';

/** `manual`: the user paged. `playback`: following turned the page. `reveal`: Jump/Resume or a selection reveal. */
export type NavigationIntent = 'manual' | 'playback' | 'reveal';

export type PageNavigatorDeps = {
  score: Score | null;
  pageCount: number;
  currentPage: () => number;
  progressivePagingActive: boolean;
  /** Lays progressive pages out up to `page`; false when it is not ready. */
  ensurePageIsLaidOut: (score: Score, page: number) => Promise<boolean>;
  countPages: (score: Score) => Promise<number>;
  setPageCount: (update: (previous: number) => number) => void;
  /** The engine's sanitized SVG for a page, through the shared score queue; null when it could not be rendered. */
  fetchPage: (score: Score, page: number) => Promise<string | null>;
  /** Installs the SVG and the matching page state together: one commit, no window of mismatched page/SVG. */
  commit: (svg: string, page: number) => void;
  afterCommit: () => void;
  /** Shared with every other render of the canvas: an install from an older render must not land after a newer one. */
  installGenerationRef: MutableRefObject<number>;
  inFlightRef: MutableRefObject<boolean>;
  /** Following is waiting for a page that was not prepared in time (null when it is not). */
  onPreparing?: (page: number | null) => void;
  log?: (stage: string, extra?: unknown) => void;
};

type Request = { page: number; intent: NavigationIntent; generation: number };

const ROLLING_RENDERS = 8;

/**
 * Page navigation with the latest target winning. Requests coalesce (rapid seeks or page presses end on the last
 * one); manual navigation supersedes pending automatic turns, and automatic turns never override a pending manual
 * one. A page is committed only if it is still the latest target when its SVG is ready, and only if no other
 * render of the canvas started meanwhile, so a slow old render cannot overwrite a newer page or score. Prepared
 * pages come from a bounded cache; a miss keeps the current page readable until the target is ready.
 */
export class PageNavigator {
  deps!: PageNavigatorDeps;
  readonly cache = new PageSvgCache();
  private generation = 0;
  private latest: Request | null = null;
  private running = false;
  private waiters = new Map<number, (committed: boolean) => void>();
  private prefetching = new Set<number>();
  private renderTimes: number[] = [];

  navigate(page: number, intent: NavigationIntent = 'manual'): Promise<boolean> {
    if (intent !== 'manual' && this.latest?.intent === 'manual') return Promise.resolve(false);
    const generation = ++this.generation;
    this.latest = { page, intent, generation };
    const result = new Promise<boolean>((resolve) => this.waiters.set(generation, resolve));
    if (!this.running) void this.run();
    return result;
  }

  /** Renders a page into the cache ahead of need (following's next destination); never commits it. */
  async prefetch(page: number): Promise<void> {
    const { score } = this.deps;
    if (!score || page < 0 || page >= this.deps.pageCount || page === this.deps.currentPage())
      return;
    if (this.cache.has(score, page) || this.prefetching.has(page)) return;
    this.prefetching.add(page);
    const installGeneration = this.deps.installGenerationRef.current;
    try {
      const svg = await this.timedFetch(score, page);
      if (
        svg &&
        this.deps.score === score &&
        this.deps.installGenerationRef.current === installGeneration
      )
        this.cache.set(score, page, svg);
    } finally {
      this.prefetching.delete(page);
    }
  }

  /** Another render touched the canvas (edit, selection repaint, font or layout): cached pages may be stale. */
  invalidate(): void {
    this.cache.clear();
  }

  /** Rolling average SVG round trip, for following's prefetch lead. */
  averageRenderMs(): number {
    if (this.renderTimes.length === 0) return 0;
    return this.renderTimes.reduce((sum, ms) => sum + ms, 0) / this.renderTimes.length;
  }

  private async run() {
    this.running = true;
    this.deps.inFlightRef.current = true;
    try {
      while (this.latest) {
        const request = this.latest;
        let committed = false;
        try {
          committed = await this.perform(request);
        } catch (error) {
          this.deps.log?.('navigate:error', { page: request.page, error });
        }
        if (this.latest?.generation === request.generation) this.latest = null;
        // Superseded requests resolve false; the loop continues with the newest.
        this.waiters.get(request.generation)?.(committed && !this.isStale(request));
        this.waiters.delete(request.generation);
        for (const [generation, resolve] of this.waiters) {
          if (generation < request.generation) {
            resolve(false);
            this.waiters.delete(generation);
          }
        }
      }
    } finally {
      this.running = false;
      this.deps.inFlightRef.current = false;
      this.deps.onPreparing?.(null);
    }
  }

  private isStale(request: Request) {
    return request.generation !== this.generation;
  }

  private async perform(request: Request): Promise<boolean> {
    const score = this.deps.score;
    if (!score || request.page < 0) return false;
    let known = this.deps.pageCount;
    if (request.page >= known) {
      if (!this.deps.progressivePagingActive) return false;
      this.deps.log?.('layout:ensure:start', { targetPage: request.page });
      if (!(await this.deps.ensurePageIsLaidOut(score, request.page))) return false;
      known = Math.max(known, await this.deps.countPages(score));
      this.deps.setPageCount((previous) => Math.max(previous, known));
      if (this.isStale(request)) return false;
    }
    const page = Math.min(request.page, Math.max(known - 1, 0));
    // One retry: another render that started while this page was being fetched may have changed the content.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const installGeneration = this.deps.installGenerationRef.current;
      let svg = this.cache.get(score, page);
      if (!svg) {
        if (request.intent === 'playback') this.deps.onPreparing?.(page);
        svg = await this.timedFetch(score, page);
        if (
          !svg &&
          this.deps.progressivePagingActive &&
          (await this.deps.ensurePageIsLaidOut(score, page))
        )
          svg = await this.timedFetch(score, page);
        if (!svg) {
          this.deps.log?.('render:failed', { targetPage: page });
          return false;
        }
        if (this.deps.installGenerationRef.current === installGeneration)
          this.cache.set(score, page, svg);
      }
      if (this.isStale(request) || this.deps.score !== score) return false;
      if (this.deps.installGenerationRef.current !== installGeneration) continue;
      this.deps.installGenerationRef.current += 1;
      this.deps.commit(svg, page);
      this.deps.onPreparing?.(null);
      this.deps.afterCommit();
      return true;
    }
    return false;
  }

  private async timedFetch(score: Score, page: number) {
    const started = performance.now();
    const svg = await this.deps.fetchPage(score, page).catch(() => null);
    if (svg) {
      this.renderTimes.push(performance.now() - started);
      if (this.renderTimes.length > ROLLING_RENDERS) this.renderTimes.shift();
    }
    return svg;
  }
}
