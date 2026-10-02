import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noPerf, resetPerf, startPerf } from '../lib/perf-trace';

type PerfWindow = Window & {
  __otsPerf?: {
    last: { label: string; phases: { name: string; ms: number }[]; totalMs: number } | null;
    history: unknown[];
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  resetPerf();
});
afterEach(() => vi.useRealTimers());

const flushFrame = async () => {
  await vi.advanceTimersByTimeAsync(50);
};

describe('perf trace', () => {
  it('records each phase of an edit and closes at the first paint', async () => {
    const perf = startPerf('pitch up');
    await perf.time('mutation', async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await perf.time('relayout', async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    perf.end();
    await flushFrame();
    const last = (window as PerfWindow).__otsPerf?.last;
    expect(last?.label).toBe('pitch up');
    expect(last?.phases.map((phase) => phase.name)).toEqual(['mutation', 'relayout', 'paint']);
    expect(last?.phases[0].ms).toBeGreaterThanOrEqual(10);
    expect(last?.phases[1].ms).toBeGreaterThanOrEqual(30);
    expect(last?.totalMs).toBeGreaterThanOrEqual(40);
  });

  it('returns what the phase returns, and still times a phase that throws', async () => {
    const perf = startPerf('x');
    await expect(perf.time('ok', () => 7)).resolves.toBe(7);
    await expect(
      perf.time('bad', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    perf.end();
    await flushFrame();
    const names = (window as PerfWindow).__otsPerf?.last?.phases.map((phase) => phase.name);
    expect(names).toEqual(['ok', 'bad', 'paint']);
  });

  it('records nothing for a phase run without a trace, and still returns its result', async () => {
    await expect(noPerf.time('stray', () => 1)).resolves.toBe(1);
    noPerf.end();
    await flushFrame();
    expect((window as PerfWindow).__otsPerf?.history).toEqual([]);
  });

  it('keeps overlapping edits apart, each with its own phases', async () => {
    const first = startPerf('first');
    const second = startPerf('second');
    await first.time('mutation', () => vi.advanceTimersByTimeAsync(5));
    await second.time('relayout', () => vi.advanceTimersByTimeAsync(5));
    first.end();
    second.end();
    await flushFrame();
    const history = (window as PerfWindow).__otsPerf?.history as {
      label: string;
      phases: { name: string }[];
    }[];
    expect(history.map((trace) => trace.label)).toEqual(['first', 'second']);
    expect(history[0].phases.map((phase) => phase.name)).toEqual(['mutation', 'paint']);
    expect(history[1].phases.map((phase) => phase.name)).toEqual(['relayout', 'paint']);
  });

  it('closes a trace once however often it is ended', async () => {
    const perf = startPerf('once');
    perf.end();
    perf.end();
    await flushFrame();
    expect((window as PerfWindow).__otsPerf?.history).toHaveLength(1);
  });

  it('keeps a bounded history, newest last', async () => {
    for (let i = 0; i < 205; i += 1) {
      startPerf(`edit ${i}`).end();
      await flushFrame();
    }
    const perf = (window as PerfWindow).__otsPerf;
    expect(perf?.history).toHaveLength(200);
    expect(perf?.last?.label).toBe('edit 204');
  });
});
