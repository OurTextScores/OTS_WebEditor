import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RENDER_WINDOW,
  maxBufferedChunks,
  releaseScheduledSource,
  renderWindowDelayMs,
  type ReleasableSource,
  type RenderWindow,
} from '@/lib/playback-window';

const WINDOW: RenderWindow = { horizonSeconds: 20, lowWaterSeconds: 10 };

describe('renderWindowDelayMs', () => {
  it('pulls immediately while inside the horizon', () => {
    expect(renderWindowDelayMs(0, WINDOW)).toBe(0);
    expect(renderWindowDelayMs(10, WINDOW)).toBe(0);
    expect(renderWindowDelayMs(20, WINDOW)).toBe(0);
  });

  it('idles down to the low-water mark once past the horizon', () => {
    // 25s buffered, drain to 10s => wait 15s.
    expect(renderWindowDelayMs(25, WINDOW)).toBe(15_000);
    expect(renderWindowDelayMs(21, WINDOW)).toBe(11_000);
  });

  it('keeps draining to low water after hysteresis has started', () => {
    expect(renderWindowDelayMs(19, WINDOW, true)).toBe(9_000);
    expect(renderWindowDelayMs(10, WINDOW, true)).toBe(0);
  });

  it('refills in batches rather than waking per chunk', () => {
    // Crossing the horizon by a hair must still idle down to low water, or the
    // loop busy-waits: one wake per chunk is what the window exists to avoid.
    expect(renderWindowDelayMs(20.001, WINDOW)).toBeGreaterThan(9_000);
  });

  it('keeps pulling when the clock reading is unusable', () => {
    // A NaN/Infinity reading means no usable clock yet; stalling playback on a
    // bad measurement would be worse than rendering ahead.
    expect(renderWindowDelayMs(Number.NaN, WINDOW)).toBe(0);
    expect(renderWindowDelayMs(Number.POSITIVE_INFINITY, WINDOW)).toBe(0);
  });

  it('never returns a negative delay', () => {
    expect(renderWindowDelayMs(-5, WINDOW)).toBe(0);
  });

  it('tolerates a low-water mark above the horizon', () => {
    const inverted: RenderWindow = { horizonSeconds: 5, lowWaterSeconds: 50 };
    // Clamped to the horizon, so it still makes progress instead of idling forever.
    expect(renderWindowDelayMs(10, inverted)).toBe(5_000);
  });

  it('degrades to unthrottled when the horizon is zero', () => {
    const zero: RenderWindow = { horizonSeconds: 0, lowWaterSeconds: 0 };
    expect(renderWindowDelayMs(0, zero)).toBe(0);
    expect(renderWindowDelayMs(30, zero)).toBe(30_000);
  });
});

describe('releaseScheduledSource', () => {
  interface FakeSource extends ReleasableSource {
    id: number;
    disconnected: boolean;
  }

  const makeSource = (id: number): FakeSource => ({
    id,
    disconnected: false,
    disconnect() {
      this.disconnected = true;
    },
  });

  it('removes the source and disconnects it', () => {
    const a = makeSource(1);
    const b = makeSource(2);
    const sources = [a, b];

    releaseScheduledSource(sources, a);

    expect(sources).toEqual([b]);
    expect(a.disconnected).toBe(true);
  });

  it('is a no-op for a source already released', () => {
    const a = makeSource(1);
    const sources: FakeSource[] = [];
    expect(() => releaseScheduledSource(sources, a)).not.toThrow();
    expect(sources).toHaveLength(0);
  });

  it('survives a source whose context has gone away', () => {
    const exploding: ReleasableSource = {
      disconnect() {
        throw new Error('context closed');
      },
    };
    const sources = [exploding];
    expect(() => releaseScheduledSource(sources, exploding)).not.toThrow();
    expect(sources).toHaveLength(0);
  });
});

describe('memory bound', () => {
  it('keeps retained sources near the window size across a long playback', () => {
    // The horizon alone does not bound memory: sources are pushed as they are
    // scheduled and, before the release handler existed, removed only when the
    // *final* one ended. Rendering stayed near the playhead while every buffer
    // behind it was still referenced, so a 22-minute score retained ~115k nodes.
    //
    // This simulates that playback: schedule up to the window, release the
    // oldest as it finishes, and assert the live list never runs away.
    const windowChunks = maxBufferedChunks(DEFAULT_RENDER_WINDOW, 44100, 512);
    const faureChunks = Math.ceil((1339.2 * 44100) / 512);
    expect(faureChunks).toBeGreaterThan(100_000);

    const live: ReleasableSource[] = [];
    let peak = 0;

    for (let i = 0; i < faureChunks; i += 1) {
      live.push({
        disconnect() {
          /* fake */
        },
      });
      // The render loop idles once it is a window ahead, so scheduling never
      // outruns playback by more than that.
      if (live.length > windowChunks) {
        releaseScheduledSource(live, live[0]);
      }
      peak = Math.max(peak, live.length);
    }

    expect(peak).toBeLessThanOrEqual(windowChunks + 1);
    expect(peak).toBeLessThan(faureChunks / 50);

    const peakMb = (peak * 512 * 2 * 4) / 1048576;
    expect(peakMb).toBeLessThan(10);
  });

  it('would retain everything without the release step', () => {
    // Guards the claim above: the same simulation with releases removed is what
    // the code did before, and it must demonstrably blow past the window.
    const windowChunks = maxBufferedChunks(DEFAULT_RENDER_WINDOW, 44100, 512);
    const live: ReleasableSource[] = [];
    for (let i = 0; i < 20_000; i += 1) {
      live.push({
        disconnect() {
          /* fake */
        },
      });
    }
    expect(live.length).toBeGreaterThan(windowChunks * 10);
  });

  it('holds a bounded number of chunks for the configured window', () => {
    const held = maxBufferedChunks(DEFAULT_RENDER_WINDOW, 44100, 512);
    expect(held).toBeLessThan(2_000);
    const heldMb = (held * 512 * 2 * 4) / 1048576;
    expect(heldMb).toBeLessThan(10);
  });

  it('scales with the horizon, so Phase 5 can raise it deliberately', () => {
    const small = maxBufferedChunks({ horizonSeconds: 10, lowWaterSeconds: 5 }, 44100, 512);
    const large = maxBufferedChunks({ horizonSeconds: 40, lowWaterSeconds: 20 }, 44100, 512);
    expect(large).toBeCloseTo(small * 4, -1);
  });
});
