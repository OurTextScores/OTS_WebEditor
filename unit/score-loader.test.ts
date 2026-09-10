import { describe, expect, it, vi } from 'vitest';
import { loadScoreWithEngineFallback, loadScoreWithInitialLayout } from '@/lib/score-loader';
import type { Score, WebMscoreInstance } from '@/lib/webmscore-loader';

const fakeScore = (overrides: Partial<Score> = {}) =>
  ({
    destroy: vi.fn(),
    ...overrides,
  }) as unknown as Score;

const fakeEngine = (load: WebMscoreInstance['load']) =>
  ({
    load,
    ready: Promise.resolve(),
  }) as WebMscoreInstance;

describe('shared score loader', () => {
  it('retries a failed worker load with the in-process engine', async () => {
    const score = fakeScore();
    const worker = fakeEngine(
      vi.fn(async () => {
        throw new Error('worker failed');
      }),
    );
    const inProcess = fakeEngine(vi.fn(async () => score));
    const logStage = vi.fn();

    const result = await loadScoreWithEngineFallback('musicxml', new Uint8Array([1]), {
      loadWorker: async () => worker,
      loadInProcess: async () => inProcess,
      logStage,
    });

    expect(result.loadedScore).toBe(score);
    expect(result.engineMode).toBe('in_process');
    expect(logStage).toHaveBeenCalledWith('worker-engine:failed', expect.any(Error));
    expect(worker.load).toHaveBeenCalledOnce();
    expect(inProcess.load).toHaveBeenCalledOnce();
  });

  it('uses incremental first-page layout for a large supported score', async () => {
    const score = fakeScore({
      layoutUntilPageState: vi.fn(async () => ({
        targetPage: 0,
        targetSatisfied: true,
        availablePages: 2,
        totalMeasures: 100,
        laidOutMeasures: 12,
        loadedUntilTick: 4_800,
        hasMorePages: true,
        isComplete: false,
      })),
    });
    const engine = fakeEngine(vi.fn(async () => score));
    const data = new Uint8Array(2 * 1024 * 1024);
    const logStage = vi.fn();

    const result = await loadScoreWithInitialLayout(engine, 'musicxml', data, { logStage });

    expect(engine.load).toHaveBeenCalledWith('musicxml', expect.any(Uint8Array), [], false);
    expect(score.layoutUntilPageState).toHaveBeenCalledWith(0);
    expect(result).toMatchObject({
      loadedScore: score,
      progressivePaging: true,
      progressiveHasMore: true,
      initialAvailablePages: 2,
    });
    expect(logStage).toHaveBeenCalledWith('progressive-load:start', { timeoutMs: 12_000 });
    expect(logStage).toHaveBeenCalledWith('progressive-load:done');
    expect(logStage).toHaveBeenCalledWith('initial-layout:start', { timeoutMs: 10_000 });
    expect(logStage).toHaveBeenCalledWith(
      'initial-layout:done',
      expect.objectContaining({ targetSatisfied: true }),
    );
  });

  it('preserves eager load stage breadcrumbs', async () => {
    const score = fakeScore();
    const engine = fakeEngine(vi.fn(async () => score));
    const logStage = vi.fn();

    await loadScoreWithInitialLayout(engine, 'musicxml', new Uint8Array([1]), { logStage });

    expect(logStage.mock.calls.map(([stage]) => stage)).toEqual([
      'eager-load:start',
      'eager-load:done',
    ]);
  });

  it('preserves progressive eager-fallback breadcrumbs', async () => {
    const progressiveScore = fakeScore();
    const fallbackScore = fakeScore();
    const engine = fakeEngine(
      vi.fn().mockResolvedValueOnce(progressiveScore).mockResolvedValueOnce(fallbackScore),
    );
    const logStage = vi.fn();

    const result = await loadScoreWithInitialLayout(
      engine,
      'musicxml',
      new Uint8Array(2 * 1024 * 1024),
      { logStage },
    );

    expect(result.loadedScore).toBe(fallbackScore);
    expect(progressiveScore.destroy).toHaveBeenCalledOnce();
    expect(logStage.mock.calls.map(([stage]) => stage)).toEqual([
      'progressive-load:start',
      'progressive-load:done',
      'eager-fallback:start',
      'eager-fallback:done',
    ]);
  });
});
