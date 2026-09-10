import { describe, expect, it } from 'vitest';
import { createCompareScrollSync } from '../components/score-editor/compare/compare-scroll-sync';

const box = (scrollTop = 0, scrollLeft = 0) => ({ scrollTop, scrollLeft });

describe('createCompareScrollSync', () => {
  it('copies the source position onto the other pane, and the vertical part onto the gutter', () => {
    const sync = createCompareScrollSync({ current: false });
    const source = box(140, 60);
    const target = box();
    const gutter = box();

    expect(sync(source, target, gutter)).toBe(true);
    expect(target).toEqual({ scrollTop: 140, scrollLeft: 60 });
    // The gutter is a narrow column with no horizontal extent to match.
    expect(gutter).toEqual({ scrollTop: 140, scrollLeft: 0 });
  });

  it('ignores a sync that arrives while one is already running', () => {
    // This is the case that matters: assigning scrollTop fires a scroll event on the
    // target, and that handler calls straight back in. Without the guard the two
    // panes take turns nudging each other.
    const guard = { current: false };
    const sync = createCompareScrollSync(guard);
    const left = box(200, 0);
    const right = box();
    const gutter = box();
    let reentrantRan: boolean | null = null;

    const echoingRight = {
      get scrollTop() {
        return right.scrollTop;
      },
      set scrollTop(value: number) {
        right.scrollTop = value;
        // The assignment above is what a real element's scroll event follows.
        reentrantRan = sync(right, left, gutter);
      },
      scrollLeft: 0,
    };

    expect(sync(left, echoingRight, gutter)).toBe(true);
    expect(reentrantRan).toBe(false);
    expect(left.scrollTop).toBe(200);
    expect(right.scrollTop).toBe(200);
  });

  it('releases the guard so the next real scroll still syncs', () => {
    const guard = { current: false };
    const sync = createCompareScrollSync(guard);
    const target = box();
    const gutter = box();

    sync(box(10, 0), target, gutter);
    expect(guard.current).toBe(false);

    expect(sync(box(320, 12), target, gutter)).toBe(true);
    expect(target).toEqual({ scrollTop: 320, scrollLeft: 12 });
  });

  it('stays inert while an external holder marks a sync in progress', () => {
    const sync = createCompareScrollSync({ current: true });
    const target = box(7, 8);

    expect(sync(box(999, 999), target, box())).toBe(false);
    expect(target).toEqual({ scrollTop: 7, scrollLeft: 8 });
  });
});
