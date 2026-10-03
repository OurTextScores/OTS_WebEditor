// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_SELECTION_BOX_CONTEXT_LIMIT } from '../../components/score-editor/ai-constants';
import {
  ensurePageIsLaidOutImpl,
  goToPageImpl,
  openScoreSessionImpl,
  resolveSelectionContextImpl,
  type EnsurePageLaidOutContext,
  type GoToPageContext,
  type OpenScoreSessionContext,
  type ResolveSelectionContext,
} from '../../components/score-editor/score-session';
import type { Score } from '../../lib/webmscore-loader';

const asScore = (methods: Record<string, unknown>) => methods as unknown as Score;
const serial = async <T>(operation: () => Promise<T>) => operation();

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveSelectionContextImpl: the selection described for an AI request', () => {
  const context = (over: Partial<Record<keyof ResolveSelectionContext, unknown>> = {}) =>
    ({
      selectedPointRef: { current: null },
      selectedElementClasses: '',
      selectionBoxes: [],
      selectedElement: null,
      selectedIndex: null,
      currentPageRef: { current: 0 },
      scoreRef: { current: null },
      score: null,
      runSerializedScoreOperation: serial,
      ...over,
    }) as unknown as ResolveSelectionContext;

  it('says so when nothing is selected', async () => {
    expect(await resolveSelectionContextImpl(context())).toBe('No active selection boxes.');
  });

  it('describes the primary point and classes, and a single selected element as one box', async () => {
    const text = await resolveSelectionContextImpl(
      context({
        selectedPointRef: { current: { page: 1, x: 10.123, y: 20 } },
        selectedElementClasses: ' Note Chord ',
        selectedElement: { x: 1, y: 2, w: 3, h: 4 },
        selectedIndex: 7,
      }),
    );
    expect(text).toBe(
      [
        'Primary selection point: page=2, x=10.12, y=20.00',
        'Primary selection classes: Note Chord',
        'Selection boxes (1 total):\n#1: page=2, x=1.00, y=2.00, w=3.00, h=4.00, index=7, classes=Note Chord',
      ].join('\n\n'),
    );
  });

  it('prefers the selection boxes, tolerates width/height names, and drops boxes without numbers', async () => {
    const text = await resolveSelectionContextImpl(
      context({
        currentPageRef: { current: 3 },
        selectedElement: { x: 9, y: 9, w: 9, h: 9 },
        selectionBoxes: [
          { index: 4, page: 0, x: 1, y: 2, w: 3, h: 4, classes: 'Note' },
          { x: 5, y: 6, width: 7, height: 8 },
          { x: 'a', y: 1, w: 1, h: 1 },
        ],
      }),
    );
    expect(text).toContain('Selection boxes (2 total):');
    expect(text).toContain('#1: page=1, x=1.00, y=2.00, w=3.00, h=4.00, index=4, classes=Note');
    // no page of its own and no primary point, so the current page; the index is its position
    expect(text).toContain('#2: page=4, x=5.00, y=6.00, w=7.00, h=8.00, index=1, classes=n/a');
  });

  it('shows a limited number of boxes and says how many were left out', async () => {
    const boxes = Array.from({ length: AI_SELECTION_BOX_CONTEXT_LIMIT + 5 }, (_, i) => ({
      index: i,
      page: 0,
      x: i,
      y: 0,
      w: 1,
      h: 1,
      classes: 'Note',
    }));
    const text = await resolveSelectionContextImpl(context({ selectionBoxes: boxes }));
    expect(text).toContain(`Selection boxes (${boxes.length} total):`);
    expect(text).toContain(`#${AI_SELECTION_BOX_CONTEXT_LIMIT}:`);
    expect(text).not.toContain(`#${AI_SELECTION_BOX_CONTEXT_LIMIT + 1}:`);
    expect(text).toContain(
      `Selection boxes truncated to first ${AI_SELECTION_BOX_CONTEXT_LIMIT} entries.`,
    );
  });

  it('appends the engine’s selection XML, asking through the serial queue', async () => {
    const run = vi.fn(serial);
    const score = asScore({
      selectionMimeData: () =>
        Uint8Array.from('<measure/>', (character) => character.charCodeAt(0)),
    });
    const text = await resolveSelectionContextImpl(
      context({ score, runSerializedScoreOperation: run }),
    );
    expect(text).toContain('Selection MIME XML:\n<measure/>');
    expect(run).toHaveBeenCalledWith(expect.any(Function), 'selectionMimeData(ai-context)');
  });

  it('skips empty or failing selection XML', async () => {
    const empty = asScore({ selectionMimeData: () => new Uint8Array() });
    expect(await resolveSelectionContextImpl(context({ score: empty }))).not.toContain(
      'Selection MIME XML',
    );
    const failing = asScore({
      selectionMimeData: () => {
        throw new Error('no');
      },
    });
    expect(await resolveSelectionContextImpl(context({ score: failing }))).toBe(
      'No active selection boxes.',
    );
  });
});

describe('ensurePageIsLaidOutImpl: laying out a page of a large score', () => {
  const context = (over: Partial<Record<keyof EnsurePageLaidOutContext, unknown>> = {}) => {
    const ctx = {
      pageCount: 3,
      progressivePageLoadInFlightRef: { current: false },
      runSerializedScoreOperation: serial,
      setPageCount: vi.fn(),
      requestLayoutProgress: vi.fn(async () => ({
        availablePages: 5,
        hasMorePages: true,
        targetSatisfied: true,
      })),
      setProgressiveHasMorePages: vi.fn(),
      ...over,
    };
    return ctx as unknown as EnsurePageLaidOutContext & typeof ctx;
  };

  it('without progressive layout, a page exists if it is within the known pages', async () => {
    const ctx = context();
    expect(await ensurePageIsLaidOutImpl(ctx, asScore({}), 2)).toBe(true);
    expect(await ensurePageIsLaidOutImpl(ctx, asScore({}), 3)).toBe(false);
  });

  it('refuses to run two layouts at once, and lets go afterwards', async () => {
    const busy = context({ progressivePageLoadInFlightRef: { current: true } });
    expect(await ensurePageIsLaidOutImpl(busy, asScore({ layoutUntilPageState: vi.fn() }), 1)).toBe(
      false,
    );
    const ctx = context();
    await ensurePageIsLaidOutImpl(ctx, asScore({ layoutUntilPageState: vi.fn() }), 1);
    expect(ctx.progressivePageLoadInFlightRef.current).toBe(false);
  });

  it('expands into unknown pages with layoutUntilPage and raises the page count from npages', async () => {
    const ctx = context();
    const score = asScore({
      layoutUntilPage: vi.fn(async () => true),
      npages: vi.fn(async () => 6),
    });
    expect(await ensurePageIsLaidOutImpl(ctx, score, 5)).toBe(true);
    expect(score.layoutUntilPage).toHaveBeenCalledWith(5);
    const raise = ctx.setPageCount.mock.calls[0][0] as (previous: number) => number;
    expect(raise(3)).toBe(6);
    expect(raise(9)).toBe(9);
    expect(ctx.requestLayoutProgress).not.toHaveBeenCalled();
  });

  it('treats the first page past the known ones as an expansion, and the last known page as not', async () => {
    const expanding = context();
    const grow = asScore({
      layoutUntilPage: vi.fn(async () => true),
      npages: vi.fn(async () => 4),
    });
    await ensurePageIsLaidOutImpl(expanding, grow, 3);
    expect(expanding.requestLayoutProgress).not.toHaveBeenCalled();

    const known = context();
    const stay = asScore({
      layoutUntilPage: vi.fn(async () => true),
      npages: vi.fn(async () => 4),
    });
    await ensurePageIsLaidOutImpl(known, stay, 2);
    expect(known.requestLayoutProgress).toHaveBeenCalledWith(stay, 2);
  });

  it('asks for the layout state of a known page, records it, and confirms a later page by laying it out', async () => {
    const ctx = context();
    const score = asScore({ layoutUntilPage: vi.fn(async () => true) });
    expect(await ensurePageIsLaidOutImpl(ctx, score, 2)).toBe(true);
    expect(ctx.requestLayoutProgress).toHaveBeenCalledWith(score, 2);
    expect(ctx.setProgressiveHasMorePages).toHaveBeenCalledWith(true);
    expect(score.layoutUntilPage).toHaveBeenCalledWith(2);
    expect((ctx.setPageCount.mock.calls[0][0] as (p: number) => number)(1)).toBe(5);
  });

  it('is not ready when the target is not satisfied or the page does not exist yet', async () => {
    const notSatisfied = context({
      requestLayoutProgress: vi.fn(async () => ({
        availablePages: 5,
        hasMorePages: false,
        targetSatisfied: false,
      })),
    });
    expect(
      await ensurePageIsLaidOutImpl(notSatisfied, asScore({ layoutUntilPageState: vi.fn() }), 1),
    ).toBe(false);
    const short = context({
      requestLayoutProgress: vi.fn(async () => ({
        availablePages: 2,
        hasMorePages: true,
        targetSatisfied: true,
      })),
    });
    expect(
      await ensurePageIsLaidOutImpl(short, asScore({ layoutUntilPageState: vi.fn() }), 2),
    ).toBe(false);
  });

  it('on failure, still lets a page the count already includes be rendered, and otherwise stops looking for more', async () => {
    const failing = () =>
      vi.fn(async () => {
        throw new Error('layout died');
      });
    const known = context({ requestLayoutProgress: failing() });
    expect(
      await ensurePageIsLaidOutImpl(known, asScore({ layoutUntilPageState: vi.fn() }), 1),
    ).toBe(true);
    const unknown = context({ requestLayoutProgress: failing() });
    expect(
      await ensurePageIsLaidOutImpl(unknown, asScore({ layoutUntilPageState: vi.fn() }), 8),
    ).toBe(false);
    expect(unknown.setProgressiveHasMorePages).toHaveBeenCalledWith(false);
  });
});

describe('goToPageImpl: changing page', () => {
  const context = (over: Partial<Record<keyof GoToPageContext, unknown>> = {}) => {
    const ctx = {
      score: asScore({ npages: vi.fn(async () => 8) }),
      pageNavigationInFlightRef: { current: false },
      currentPageRef: { current: 1 },
      pageCount: 4,
      largeScoreSessionRef: { current: false },
      progressivePagingActive: false,
      progressiveHasMorePages: false,
      ensurePageIsLaidOut: vi.fn(async () => true),
      runSerializedScoreOperation: serial,
      setPageCount: vi.fn(),
      setCurrentPage: vi.fn(),
      renderScore: vi.fn(async () => true),
      refreshSelectionOverlay: vi.fn(),
      selectedIndex: 2,
      selectedPoint: { page: 1, x: 3, y: 4 },
      ...over,
    };
    return ctx as unknown as GoToPageContext & typeof ctx;
  };

  it('renders the page, sets it as current, and refreshes the selection overlay', async () => {
    const ctx = context();
    await goToPageImpl(ctx, 2);
    expect(ctx.setCurrentPage).toHaveBeenCalledWith(2);
    expect(ctx.renderScore).toHaveBeenCalledWith(ctx.score, 2);
    expect(ctx.refreshSelectionOverlay).toHaveBeenCalledWith(2, { page: 1, x: 3, y: 4 });
    expect(ctx.pageNavigationInFlightRef.current).toBe(false);
  });

  it('does nothing with no score, a negative page, a page past the end, or a navigation already running', async () => {
    for (const [over, page] of [
      [{ score: null }, 1],
      [{}, -1],
      [{}, 4],
      [{ pageNavigationInFlightRef: { current: true } }, 1],
    ] as const) {
      const ctx = context(over);
      await goToPageImpl(ctx, page);
      expect(ctx.renderScore).not.toHaveBeenCalled();
      expect(ctx.setCurrentPage).not.toHaveBeenCalled();
    }
  });

  it('puts the previous page back when the new one cannot be rendered', async () => {
    const ctx = context({ renderScore: vi.fn(async () => false) });
    await goToPageImpl(ctx, 3);
    expect(ctx.setCurrentPage.mock.calls).toEqual([[3], [1]]);
    expect(ctx.refreshSelectionOverlay).not.toHaveBeenCalled();
    expect(ctx.pageNavigationInFlightRef.current).toBe(false);
  });

  it('lays out a page beyond the known ones first when paging progressively, and raises the page count', async () => {
    const ctx = context({ progressivePagingActive: true });
    await goToPageImpl(ctx, 6);
    expect(ctx.ensurePageIsLaidOut).toHaveBeenCalledWith(ctx.score, 6);
    expect((ctx.setPageCount.mock.calls[0][0] as (p: number) => number)(4)).toBe(8);
    expect(ctx.setCurrentPage).toHaveBeenCalledWith(6);
  });

  it('never goes past the last page the score really has', async () => {
    const ctx = context({
      progressivePagingActive: true,
      score: asScore({ npages: vi.fn(async () => 5) }),
    });
    await goToPageImpl(ctx, 9);
    expect(ctx.setCurrentPage).toHaveBeenCalledWith(4);
    expect(ctx.renderScore).toHaveBeenCalledWith(ctx.score, 4);
  });

  it('stays put when the page is not ready, and retries the layout once if the first render fails', async () => {
    const notReady = context({
      progressivePagingActive: true,
      ensurePageIsLaidOut: vi.fn(async () => false),
    });
    await goToPageImpl(notReady, 6);
    expect(notReady.setCurrentPage).not.toHaveBeenCalled();

    const retry = context({
      progressivePagingActive: true,
      renderScore: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });
    await goToPageImpl(retry, 2);
    expect(retry.ensurePageIsLaidOut).toHaveBeenCalledWith(retry.score, 2);
    expect(retry.renderScore).toHaveBeenCalledTimes(2);
    expect(retry.refreshSelectionOverlay).toHaveBeenCalled();
  });

  it('survives a render that throws and frees the navigation lock', async () => {
    const ctx = context({
      renderScore: vi.fn(async () => {
        throw new Error('x');
      }),
    });
    await goToPageImpl(ctx, 2);
    expect(ctx.pageNavigationInFlightRef.current).toBe(false);
  });
});

describe('openScoreSessionImpl: the server-side score session', () => {
  const context = (over: Partial<Record<keyof OpenScoreSessionContext, unknown>> = {}) => {
    const ctx = {
      isSyncingRef: { current: false },
      scoreSessionId: null as string | null,
      scoreRevision: 0,
      resolveXmlContext: vi.fn(async () => '<score/>'),
      lastSyncedXmlRef: { current: null as string | null },
      lastSyncedRevisionRef: { current: null as number | null },
      activeLaunchContext: null,
      setScoreSessionId: vi.fn(),
      setScoreRevision: vi.fn(),
      ...over,
    };
    return ctx as unknown as OpenScoreSessionContext & typeof ctx;
  };
  const respond = (body: unknown, ok = true) => {
    const fetchMock = vi.fn(async () =>
      ok ? Response.json(body) : new Response('no', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

  it('opens a session for the score and remembers what it sent', async () => {
    const fetchMock = respond({ scoreSessionId: 's1', revision: 1 });
    const ctx = context();
    expect(await openScoreSessionImpl(ctx)).toEqual({ scoreSessionId: 's1', revision: 1 });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(
      '/api/music/scoreops/session/open',
    );
    expect(sent(fetchMock)).toEqual({ content: '<score/>' });
    expect(ctx.setScoreSessionId).toHaveBeenCalledWith('s1');
    expect(ctx.setScoreRevision).toHaveBeenCalledWith(1);
    expect(ctx.lastSyncedXmlRef.current).toBe('<score/>');
    expect(ctx.lastSyncedRevisionRef.current).toBe(1);
    expect(ctx.isSyncingRef.current).toBe(false);
  });

  it('syncs an existing session from its base revision, with the launch context', async () => {
    const fetchMock = respond({ scoreSessionId: 's1', newRevision: 4 });
    const launch = { source: 'ots' };
    const ctx = context({ scoreSessionId: 's1', scoreRevision: 3, activeLaunchContext: launch });
    expect(await openScoreSessionImpl(ctx, '<changed/>')).toEqual({
      scoreSessionId: 's1',
      revision: 4,
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(
      '/api/music/scoreops/sync',
    );
    expect(sent(fetchMock)).toEqual({
      content: '<changed/>',
      scoreSessionId: 's1',
      baseRevision: 3,
      scoreMeta: { launchContext: launch },
    });
  });

  it('does not ask the server when nothing changed, the score is empty, or a sync is already running', async () => {
    const fetchMock = respond({});
    const unchanged = context({
      scoreSessionId: 's1',
      scoreRevision: 2,
      lastSyncedXmlRef: { current: '<score/>' },
      lastSyncedRevisionRef: { current: 2 },
    });
    expect(await openScoreSessionImpl(unchanged)).toEqual({ scoreSessionId: 's1', revision: 2 });
    const empty = context({ resolveXmlContext: vi.fn(async () => '  ') });
    expect(await openScoreSessionImpl(empty)).toEqual({ scoreSessionId: null, revision: 0 });
    const syncing = context({
      isSyncingRef: { current: true },
      scoreSessionId: 's9',
      scoreRevision: 5,
    });
    expect(await openScoreSessionImpl(syncing)).toEqual({ scoreSessionId: 's9', revision: 5 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the old session and frees the lock when the server refuses or the request fails', async () => {
    respond({}, false);
    const refused = context({ scoreSessionId: 's1', scoreRevision: 2 });
    expect(await openScoreSessionImpl(refused)).toEqual({ scoreSessionId: 's1', revision: 2 });
    expect(refused.setScoreSessionId).not.toHaveBeenCalled();
    expect(refused.isSyncingRef.current).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const failed = context();
    expect(await openScoreSessionImpl(failed)).toEqual({ scoreSessionId: null, revision: 0 });
    expect(failed.isSyncingRef.current).toBe(false);
  });
});
