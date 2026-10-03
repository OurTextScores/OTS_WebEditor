// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LARGE_SCORE_BACKGROUND_TASK_DELAY_MS,
  LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES,
  LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS,
} from '../../components/score-editor/layout-constants';
import {
  scheduleBackgroundInitTasksImpl,
  type BackgroundInitContext,
} from '../../components/score-editor/score-session';
import type { InputFileFormat, Score } from '../../lib/webmscore-loader';

const FORMAT = 'musicxml' as unknown as InputFileFormat;

function setup(
  over: {
    ctx?: Partial<Record<keyof BackgroundInitContext, unknown>>;
    score?: Record<string, unknown>;
  } = {},
) {
  const loaded = { saveAudio: vi.fn(), ...over.score } as unknown as Score;
  const ctx = {
    clearScheduledBackgroundInit: vi.fn(),
    scoreRef: { current: loaded },
    backgroundInitTimerRef: { current: null },
    interactionPreparingRef: { current: false },
    pageNavigationInFlightRef: { current: false },
    progressivePageLoadInFlightRef: { current: false },
    refreshScoreMetadata: vi.fn(async () => undefined),
    refreshInstrumentTemplates: vi.fn(async () => undefined),
    ensureSoundFontLoaded: vi.fn(async () => true),
    createInitialLoadCheckpoint: vi.fn(async () => undefined),
    prefetchSoundFontBytes: vi.fn(async () => null),
    ...over.ctx,
  } as unknown as BackgroundInitContext &
    Record<string, ReturnType<typeof vi.fn> & { current?: unknown }>;
  const stages: string[] = [];
  const logStage = (stage: string) => void stages.push(stage);
  const schedule = (options: Partial<Parameters<typeof scheduleBackgroundInitTasksImpl>[2]> = {}) =>
    scheduleBackgroundInitTasksImpl(ctx, loaded, {
      format: FORMAT,
      inputByteLength: 100,
      isLargeInput: false,
      progressivePaging: false,
      logStage,
      ...options,
    });
  return { ctx, loaded, stages, schedule };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('scheduleBackgroundInitTasksImpl: a normal score', () => {
  it('cancels any earlier schedule, then refreshes metadata and instruments and loads the soundfont', async () => {
    const { ctx, loaded, schedule, stages } = setup();
    schedule();
    await vi.runAllTimersAsync();
    expect(ctx.clearScheduledBackgroundInit).toHaveBeenCalledTimes(1);
    expect(ctx.refreshScoreMetadata).toHaveBeenCalledWith(loaded);
    expect(ctx.refreshInstrumentTemplates).toHaveBeenCalledWith(loaded);
    // once to warm up, once as a task
    expect(ctx.ensureSoundFontLoaded).toHaveBeenCalledTimes(2);
    expect(stages).toEqual([
      'soundfont:warmup-scheduled',
      'background-tasks:start',
      'refresh-metadata:start',
      'refresh-metadata:done',
      'refresh-instruments:start',
      'refresh-instruments:done',
      'soundfont:start',
      'soundfont:done',
    ]);
  });

  it('skips the soundfont when the build cannot render audio', async () => {
    const { ctx, schedule } = setup({ score: { saveAudio: undefined } });
    schedule();
    await vi.runAllTimersAsync();
    expect(ctx.ensureSoundFontLoaded).not.toHaveBeenCalled();
    expect(ctx.refreshScoreMetadata).toHaveBeenCalled();
  });

  it('makes the first checkpoint only when asked, for the score id it was given', async () => {
    const without = setup();
    without.schedule();
    await vi.runAllTimersAsync();
    expect(without.ctx.createInitialLoadCheckpoint).not.toHaveBeenCalled();

    const withIt = setup();
    withIt.schedule({ createInitialCheckpoint: true, checkpointScoreId: 'url:abc' });
    await vi.runAllTimersAsync();
    expect(withIt.ctx.createInitialLoadCheckpoint).toHaveBeenCalledWith(withIt.loaded, 'url:abc');
    expect(withIt.stages).toContain('checkpoint:done');
  });

  it('carries on after a task fails or runs too long', async () => {
    const { ctx, schedule, stages } = setup({
      ctx: {
        refreshScoreMetadata: vi.fn(async () => {
          throw new Error('metadata');
        }),
        refreshInstrumentTemplates: vi.fn(() => new Promise<void>(() => {})),
      },
    });
    schedule({ createInitialCheckpoint: true });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stages).toEqual(
      expect.arrayContaining([
        'refresh-metadata:failed',
        'refresh-instruments:failed',
        'soundfont:done',
        'checkpoint:done',
      ]),
    );
    expect(ctx.createInitialLoadCheckpoint).toHaveBeenCalled();
  });

  it('does nothing if another score was loaded in the meantime', async () => {
    const { ctx, schedule } = setup();
    (ctx.scoreRef as { current: unknown }).current = {};
    schedule();
    await vi.runAllTimersAsync();
    expect(ctx.refreshScoreMetadata).not.toHaveBeenCalled();
    expect(ctx.refreshInstrumentTemplates).not.toHaveBeenCalled();
  });
});

describe('scheduleBackgroundInitTasksImpl: a large score', () => {
  it('waits before starting, and records the timer so it can be cancelled', async () => {
    const { ctx, schedule, stages } = setup();
    schedule({ isLargeInput: true, inputByteLength: 9_000_000, progressivePaging: true });
    await vi.advanceTimersByTimeAsync(LARGE_SCORE_BACKGROUND_TASK_DELAY_MS - 1);
    expect(ctx.refreshScoreMetadata).not.toHaveBeenCalled();
    expect(ctx.backgroundInitTimerRef.current).not.toBeNull();
    expect(stages).toContain('background-tasks:deferred');
    await vi.advanceTimersByTimeAsync(2);
    expect(ctx.refreshScoreMetadata).toHaveBeenCalled();
    expect(ctx.backgroundInitTimerRef.current).toBeNull();
  });

  it('only fetches the soundfont bytes while the interface is still being prepared, and starts once it is ready', async () => {
    const { ctx, schedule, stages } = setup({
      ctx: { interactionPreparingRef: { current: true } },
    });
    schedule({ isLargeInput: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.prefetchSoundFontBytes).toHaveBeenCalledTimes(1);
    expect(stages).toContain('soundfont:warmup-deferred');
    await vi.advanceTimersByTimeAsync(LARGE_SCORE_BACKGROUND_TASK_DELAY_MS + 3000);
    expect(ctx.refreshScoreMetadata).not.toHaveBeenCalled();
    expect(stages.filter((s) => s === 'background-tasks:deferred').length).toBeGreaterThan(1);
    (ctx.interactionPreparingRef as { current: boolean }).current = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(ctx.refreshScoreMetadata).toHaveBeenCalled();
  });

  it('keeps retrying while a page navigation is running, then gives up after the maximum', async () => {
    const { ctx, schedule, stages } = setup({
      ctx: { pageNavigationInFlightRef: { current: true } },
    });
    schedule({ isLargeInput: true });
    await vi.advanceTimersByTimeAsync(
      LARGE_SCORE_BACKGROUND_TASK_DELAY_MS +
        (LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES + 2) * LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS,
    );
    expect(ctx.refreshScoreMetadata).not.toHaveBeenCalled();
    expect(stages).toContain('background-tasks:skipped');
    expect(ctx.backgroundInitTimerRef.current).toBeNull();
  });

  it('runs once the navigation ends', async () => {
    const { ctx, schedule } = setup({ ctx: { progressivePageLoadInFlightRef: { current: true } } });
    schedule({ isLargeInput: true });
    await vi.advanceTimersByTimeAsync(
      LARGE_SCORE_BACKGROUND_TASK_DELAY_MS + LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS,
    );
    expect(ctx.refreshScoreMetadata).not.toHaveBeenCalled();
    (ctx.progressivePageLoadInFlightRef as { current: boolean }).current = false;
    await vi.advanceTimersByTimeAsync(LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS);
    expect(ctx.refreshScoreMetadata).toHaveBeenCalled();
  });
});
