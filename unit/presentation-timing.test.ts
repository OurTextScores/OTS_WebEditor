import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presentationContextTime } from '../lib/playback/transport-clock';
import {
  getPresentationPreferences,
  resetPresentationPreferencesForTests,
  setPresentationLead,
  visualScoreTime,
} from '../lib/playback/presentation-preferences';

beforeEach(() => {
  localStorage.clear();
  resetPresentationPreferencesForTests();
});
afterEach(() => {
  localStorage.clear();
  resetPresentationPreferencesForTests();
});
describe('output-aligned presentation', () => {
  it('extrapolates valid output timestamps without subtracting latency again', () => {
    expect(
      presentationContextTime(
        {
          currentTime: 10,
          state: 'running',
          outputLatency: 0.2,
          getOutputTimestamp: () => ({ contextTime: 9.8, performanceTime: 1000 }),
        },
        1050,
      ),
    ).toBeCloseTo(9.85);
  });
  it('uses one reported latency when timestamps are zero, stale, invalid or unavailable', () => {
    for (const stamp of [
      { contextTime: 0, performanceTime: 0 },
      { contextTime: 9, performanceTime: 1 },
      { contextTime: NaN, performanceTime: 1000 },
      { contextTime: 9.9, performanceTime: 10000 },
    ]) {
      expect(
        presentationContextTime(
          {
            currentTime: 10,
            state: 'running',
            outputLatency: 0.08,
            baseLatency: 0.02,
            getOutputTimestamp: () => stamp,
          },
          1100,
        ),
      ).toBeCloseTo(9.92);
    }
    expect(presentationContextTime({ currentTime: 10, state: 'running', baseLatency: 0.02 })).toBe(
      9.98,
    );
  });
  it('does not extrapolate a suspended clock, and cannot run before zero or ahead of scheduling', () => {
    expect(
      presentationContextTime(
        {
          currentTime: 10,
          state: 'suspended',
          outputLatency: 0.08,
          getOutputTimestamp: () => ({ contextTime: 9.8, performanceTime: 1000 }),
        },
        1500,
      ),
    ).toBe(9.92);
    expect(
      presentationContextTime({ currentTime: 0.01, state: 'running', outputLatency: 0.08 }),
    ).toBe(0);
    expect(
      presentationContextTime(
        {
          currentTime: 10,
          state: 'running',
          getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 1000 }),
        },
        1050,
      ),
    ).toBe(10);
  });
  it('keeps measure and cursor leads independent and measured in real milliseconds at every speed', () => {
    setPresentationLead('measure', 25);
    setPresentationLead('cursor', -40);
    for (const performanceTime of [500, 1000, 2000]) {
      expect(visualScoreTime(performanceTime, 'measure')).toBe(performanceTime + 25);
      expect(visualScoreTime(performanceTime, 'cursor')).toBe(performanceTime - 40);
    }
    resetPresentationPreferencesForTests();
    expect(getPresentationPreferences()).toEqual({ measure: 25, cursor: -40 });
    expect(visualScoreTime(10, 'cursor')).toBe(0);
  });
});
