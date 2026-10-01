import { describe, expect, it } from 'vitest';
import {
  describeNavigationTarget,
  parseNavigationQuery,
} from '../../components/shell/navigationQuery';

describe('parseNavigationQuery', () => {
  it.each([
    ['m125', { kind: 'bar', bar: 125 }],
    ['b12', { kind: 'bar', bar: 12 }],
    ['M7', { kind: 'bar', bar: 7 }],
    ['m 40', { kind: 'bar', bar: 40 }],
    ['  b3  ', { kind: 'bar', bar: 3 }],
    ['p3', { kind: 'page', page: 3 }],
    ['P 10', { kind: 'page', page: 10 }],
    ['rA', { kind: 'rehearsal', mark: 'A' }],
    ['r A2', { kind: 'rehearsal', mark: 'A2' }],
    ['r12', { kind: 'rehearsal', mark: '12' }],
  ])('reads %s', (query, target) => {
    expect(parseNavigationQuery(query)).toEqual(target);
  });

  it.each(['', 'm', 'b', 'p', 'r', 'm0', 'p0', 'mx', 'px1', 'dynamics', 'bar 5', 'm12x'])(
    'leaves %j to command search',
    (query) => {
      expect(parseNavigationQuery(query)).toBeNull();
    },
  );

  describe('mixed into command search', () => {
    it('does not read ordinary words starting with r as rehearsal marks', () => {
      for (const word of ['repeat', 'redo', 'rest', 'rhythm', 'res']) {
        expect(parseNavigationQuery(word), word).toBeNull();
      }
    });
  });

  describe('in go-to mode', () => {
    it('treats a lone number as a bar', () => {
      expect(parseNavigationQuery('42', { gotoMode: true })).toEqual({ kind: 'bar', bar: 42 });
      expect(parseNavigationQuery('42')).toBeNull();
    });

    it('accepts any rehearsal text', () => {
      expect(parseNavigationQuery('rIntro', { gotoMode: true })).toEqual({
        kind: 'rehearsal',
        mark: 'Intro',
      });
    });

    it('still rejects bar zero and nonsense', () => {
      expect(parseNavigationQuery('0', { gotoMode: true })).toBeNull();
      expect(parseNavigationQuery('hello', { gotoMode: true })).toBeNull();
    });
  });

  it('rejects numbers too large to be exact', () => {
    expect(parseNavigationQuery('m99999999999999999999')).toBeNull();
  });
});

describe('describeNavigationTarget', () => {
  it('words each kind', () => {
    expect(describeNavigationTarget({ kind: 'bar', bar: 5 })).toBe('Go to bar 5');
    expect(describeNavigationTarget({ kind: 'page', page: 2 })).toBe('Go to page 2');
    expect(describeNavigationTarget({ kind: 'rehearsal', mark: 'B' })).toBe(
      'Go to rehearsal mark B',
    );
  });
});
