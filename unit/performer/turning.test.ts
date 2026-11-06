import { describe, expect, it } from 'vitest';
import {
  halfViewOf,
  splitPoint,
  systemsOf,
  topThatFits,
  type Band,
} from '../../components/performer/turning/halfPage';
import {
  DEFAULT_PEDALS,
  keyLabel,
  teach,
  turnForPedal,
} from '../../components/performer/turning/pedalMapping';
import { clampTurn, step, type TurnContext } from '../../components/performer/turning/turnMachine';

// Three systems on page 0 (two parts each), two on page 1, one on page 2; pages 1000 high
const band = (page: number, system: number, y: number, height: number): Band => ({
  page,
  system,
  y,
  height,
});
const BANDS: Band[] = [
  band(0, 0, 100, 80),
  band(0, 0, 200, 80), // system 0: 100-280
  band(0, 1, 400, 80),
  band(0, 1, 500, 80), // system 1: 400-580
  band(0, 2, 700, 200), // system 2: 700-900
  band(1, 0, 120, 200), // 120-320
  band(1, 1, 450, 300), // 450-750
  band(2, 0, 100, 300),
];

describe('half-page turns split between systems', () => {
  it('collects each system from its parts, top to bottom', () => {
    expect(systemsOf(BANDS, 0)).toEqual([
      { top: 100, bottom: 280 },
      { top: 400, bottom: 580 },
      { top: 700, bottom: 900 },
    ]);
    expect(systemsOf(BANDS, 3)).toEqual([]);
  });

  it('splits in the gap nearest the middle, and not a page with one system', () => {
    expect(splitPoint(systemsOf(BANDS, 0), 1000)).toBe(640); // gaps at 340 and 640: 640 is nearer 500
    expect(splitPoint(systemsOf(BANDS, 2), 1000)).toBeNull();
  });

  it('shows of the next page only the whole systems that fit above the split', () => {
    const page1 = systemsOf(BANDS, 1);
    expect(topThatFits(page1, 640)).toBe(385); // system 0 ends at 320; half the gap to 450
    expect(topThatFits(page1, 800)).toBe(750); // both fit: down to the end of the last system
    expect(topThatFits(page1, 300)).toBeNull(); // not even the first
    expect(halfViewOf(BANDS, 0, 1000)).toEqual({ split: 640, nextTop: 385 });
    expect(halfViewOf(BANDS, 2, 1000)).toBeNull();
  });
});

describe('the turn state machine', () => {
  const context = (over: Partial<TurnContext> = {}): TurnContext => ({
    pageCount: 3,
    halfPages: true,
    canHalf: (page) => page === 0 || page === 1,
    ...over,
  });

  it('goes page -> half -> next page with half pages on, and back one step', () => {
    let state = { page: 0, half: false };
    state = step(state, 'next', context());
    expect(state).toEqual({ page: 0, half: true });
    state = step(state, 'next', context());
    expect(state).toEqual({ page: 1, half: false });
    expect(step({ page: 1, half: true }, 'previous', context())).toEqual({ page: 1, half: false });
    expect(step({ page: 1, half: false }, 'previous', context())).toEqual({ page: 0, half: false });
  });

  it('turns whole pages with half pages off, or where a page cannot be split; stays at either end', () => {
    expect(step({ page: 0, half: false }, 'next', context({ halfPages: false }))).toEqual({
      page: 1,
      half: false,
    });
    expect(step({ page: 1, half: false }, 'next', context({ canHalf: () => false }))).toEqual({
      page: 2,
      half: false,
    });
    expect(step({ page: 2, half: false }, 'next', context())).toEqual({ page: 2, half: false });
    expect(step({ page: 0, half: false }, 'previous', context())).toEqual({ page: 0, half: false });
  });

  it('keeps the page whole and in range after a relayout', () => {
    expect(clampTurn({ page: 5, half: true }, 3)).toEqual({ page: 2, half: false });
    expect(clampTurn({ page: 1, half: true }, 3)).toEqual({ page: 1, half: false });
  });
});

describe('pedal keys', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    turnForPedal(
      { key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods } as KeyboardEvent,
      DEFAULT_PEDALS,
    );

  it('accepts the common pedal keys by default, and no key with a modifier', () => {
    expect(key('ArrowRight')).toBe('next');
    expect(key('PageUp')).toBe('previous');
    expect(key('a')).toBeNull();
    expect(key('ArrowRight', { metaKey: true })).toBeNull();
  });

  it('teaches a pedal its key, taking it from the other turn so a key never means both', () => {
    const taught = teach(DEFAULT_PEDALS, 'previous', 'ArrowDown');
    expect(taught.previous[0]).toBe('ArrowDown');
    expect(taught.next).not.toContain('ArrowDown');
    expect(
      turnForPedal({ key: 'ArrowDown', ctrlKey: false, metaKey: false, altKey: false }, taught),
    ).toBe('previous');
    expect(
      teach(taught, 'previous', 'ArrowDown').previous.filter((k) => k === 'ArrowDown'),
    ).toHaveLength(1);
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('PageDown')).toBe('PageDown');
  });
});
