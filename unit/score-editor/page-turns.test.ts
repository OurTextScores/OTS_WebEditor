import { describe, expect, it, vi } from 'vitest';
import {
  PageNavigator,
  PageSvgCache,
  type PageNavigatorDeps,
} from '@/components/score-editor/page-turns';
import type { Score } from '@/lib/webmscore-loader';

/** A navigator over a fake engine whose page renders the test resolves by hand. */
function setup(over: Partial<PageNavigatorDeps> = {}) {
  const score = {} as Score;
  const pending = new Map<number, Array<(svg: string | null) => void>>();
  let current = 0;
  const commits: number[] = [];
  const navigator = new PageNavigator();
  const deps: PageNavigatorDeps = {
    score,
    pageCount: 4,
    currentPage: () => current,
    progressivePagingActive: false,
    ensurePageIsLaidOut: vi.fn(async () => true),
    countPages: vi.fn(async () => 4),
    setPageCount: vi.fn(),
    fetchPage: vi.fn(
      (_score: Score, page: number) =>
        new Promise<string | null>((resolve) =>
          pending.set(page, [...(pending.get(page) ?? []), resolve]),
        ),
    ),
    commit: vi.fn((_svg: string, page: number) => {
      current = page;
      commits.push(page);
    }),
    afterCommit: vi.fn(),
    installGenerationRef: { current: 0 },
    inFlightRef: { current: false },
    onPreparing: vi.fn(),
    ...over,
  };
  navigator.deps = deps;
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };
  const render = async (page: number, svg: string | null = `<svg data-page="${page}"/>`) => {
    const queue = pending.get(page);
    const resolve = queue?.shift();
    if (!resolve) throw new Error(`no render pending for page ${page}`);
    resolve(svg);
    await settle();
  };
  return { navigator, deps, commits, render, settle, current: () => current };
}

describe('page navigation', () => {
  it('coalesces rapid requests to the latest target and resolves superseded ones false', async () => {
    const { navigator, commits, render, deps } = setup();
    const first = navigator.navigate(1, 'playback');
    const second = navigator.navigate(2, 'playback');
    const third = navigator.navigate(3, 'playback');
    await render(1);
    await render(3);
    expect(commits).toEqual([3]);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(await third).toBe(true);
    // The superseded page was still cached for later.
    expect(navigator.cache.has(deps.score!, 1)).toBe(true);
    expect(deps.inFlightRef.current).toBe(false);
  });

  it('lets a manual page supersede a pending playback turn, and ignores playback turns while it is pending', async () => {
    const { navigator, commits, render } = setup();
    const playback = navigator.navigate(2, 'playback');
    const manual = navigator.navigate(1, 'manual');
    expect(await navigator.navigate(3, 'playback')).toBe(false);
    await render(2);
    await render(1);
    expect(commits).toEqual([1]);
    expect(await playback).toBe(false);
    expect(await manual).toBe(true);
    // Once the manual turn is committed, following may turn pages again.
    const later = navigator.navigate(2, 'playback');
    await Promise.resolve();
    expect(await later).toBe(true);
    expect(commits).toEqual([1, 2]);
  });

  it('does not install a page whose render was overtaken by another render of the canvas, and retries', async () => {
    const { navigator, commits, render, deps } = setup();
    const turn = navigator.navigate(2, 'playback');
    // An edit re-rendered the canvas while page 2 was being prepared.
    deps.installGenerationRef.current += 1;
    navigator.invalidate();
    await render(2, '<svg data-stale/>');
    expect(commits).toEqual([]);
    await render(2, '<svg data-fresh/>');
    expect(await turn).toBe(true);
    expect(vi.mocked(deps.commit).mock.calls[0][0]).toBe('<svg data-fresh/>');
  });

  it('commits a prepared page without rendering, and keeps the current page when a render fails', async () => {
    const { navigator, commits, render, deps, current } = setup();
    const prefetch = navigator.prefetch(2);
    await render(2);
    await prefetch;
    expect(deps.fetchPage).toHaveBeenCalledOnce();
    expect(await navigator.navigate(2, 'playback')).toBe(true);
    expect(deps.fetchPage).toHaveBeenCalledOnce();
    expect(commits).toEqual([2]);

    const failing = navigator.navigate(3, 'playback');
    expect(deps.onPreparing).toHaveBeenLastCalledWith(3);
    await render(3, null);
    expect(await failing).toBe(false);
    expect(current()).toBe(2);
    expect(deps.onPreparing).toHaveBeenLastCalledWith(null);
  });

  it('discards a prefetch that finishes after the canvas was re-rendered', async () => {
    const { navigator, render, deps } = setup();
    const prefetch = navigator.prefetch(1);
    deps.installGenerationRef.current += 1;
    await render(1);
    await prefetch;
    expect(navigator.cache.has(deps.score!, 1)).toBe(false);
  });

  it('lays out a progressive page before rendering it, and refuses unknown pages otherwise', async () => {
    const fixed = setup({ pageCount: 2 });
    expect(await fixed.navigator.navigate(5, 'manual')).toBe(false);
    const progressive = setup({ pageCount: 2, progressivePagingActive: true });
    const turn = progressive.navigator.navigate(3, 'manual');
    await progressive.settle();
    expect(progressive.deps.ensurePageIsLaidOut).toHaveBeenCalledWith(progressive.deps.score, 3);
    await progressive.render(3);
    expect(await turn).toBe(true);
  });
});

describe('page navigation edge cases (from the former goToPageImpl contract)', () => {
  it('refreshes the selection overlay after a commit, and does nothing without a score or with a negative page', async () => {
    const { navigator, render, deps } = setup();
    const turn = navigator.navigate(2);
    await render(2);
    expect(await turn).toBe(true);
    expect(deps.afterCommit).toHaveBeenCalledOnce();
    expect(await navigator.navigate(-1)).toBe(false);
    const empty = setup({ score: null });
    expect(await empty.navigator.navigate(1)).toBe(false);
    expect(empty.deps.fetchPage).not.toHaveBeenCalled();
  });

  it('never goes past the last page the score really has, and stays when layout is not ready', async () => {
    const { navigator, render, deps } = setup({
      pageCount: 2,
      progressivePagingActive: true,
      countPages: vi.fn(async () => 5),
    });
    const turn = navigator.navigate(9);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect((vi.mocked(deps.setPageCount).mock.calls[0][0] as (p: number) => number)(2)).toBe(5);
    await render(4);
    expect(await turn).toBe(true);
    const notReady = setup({
      pageCount: 2,
      progressivePagingActive: true,
      ensurePageIsLaidOut: vi.fn(async () => false),
    });
    expect(await notReady.navigator.navigate(6)).toBe(false);
    expect(notReady.deps.fetchPage).not.toHaveBeenCalled();
  });

  it('retries the layout once when a progressive page first fails to render', async () => {
    const { navigator, render, deps } = setup({ progressivePagingActive: true });
    const turn = navigator.navigate(2);
    await render(2, null);
    expect(deps.ensurePageIsLaidOut).toHaveBeenCalledWith(deps.score, 2);
    await render(2);
    expect(await turn).toBe(true);
  });

  it('survives a render that throws and frees the navigation lock', async () => {
    const { navigator, deps, current } = setup({
      fetchPage: vi.fn(async () => {
        throw new Error('x');
      }),
    });
    expect(await navigator.navigate(2)).toBe(false);
    expect(deps.inFlightRef.current).toBe(false);
    expect(current()).toBe(0);
  });
});

describe('page SVG cache', () => {
  it('is bounded by entries and size, scoped to one score, and evicts least recently used', () => {
    const cache = new PageSvgCache(2, 10);
    const a = {};
    cache.set(a, 0, 'aaaa');
    cache.set(a, 1, 'bbbb');
    cache.get(a, 0);
    cache.set(a, 2, 'cccc');
    expect(cache.stats().pages).toEqual([0, 2]);
    cache.set(a, 3, 'dddddddd');
    expect(cache.stats()).toMatchObject({ pages: [3], chars: 8 });
    cache.set(a, 4, 'x'.repeat(11));
    expect(cache.has(a, 4)).toBe(false);
    const b = {};
    expect(cache.get(b, 3)).toBeNull();
    cache.set(b, 0, 'z');
    expect(cache.has(a, 3)).toBe(false);
  });
});
