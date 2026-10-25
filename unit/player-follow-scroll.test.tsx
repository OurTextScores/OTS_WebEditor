import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerFollowScroll } from '@/components/score-player/usePlayerFollowScroll';

const viewport = () => {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientHeight', { value: 600 });
  Object.defineProperty(element, 'clientWidth', { value: 800 });
  element.getBoundingClientRect = () => ({ top: 0, left: 0 }) as DOMRect;
  element.scrollTo = vi.fn() as unknown as HTMLElement['scrollTo'];
  return element;
};
const rect = (top: number) =>
  ({
    getBoundingClientRect: () => ({ top, left: 100, width: 300, height: 120 }),
  }) as SVGRectElement;

afterEach(() => vi.unstubAllGlobals());

describe('player system following', () => {
  it('scrolls only when the active system leaves the readable band, not on every note', () => {
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => (run(0), 1));
    const view = viewport();
    const refs = {
      viewportRef: { current: view },
      activeMeasureRef: { current: rect(200) },
      programmaticScrollRef: { current: false },
      programmaticScrollTimerRef: { current: null },
    };
    const hook = renderHook(
      ({ key }) => usePlayerFollowScroll({ active: true, targetKey: key, refs }),
      {
        initialProps: { key: 'note-1' },
      },
    );
    hook.rerender({ key: 'note-2' });
    hook.rerender({ key: 'note-3' });
    expect(view.scrollTo).not.toHaveBeenCalled();
    refs.activeMeasureRef.current = rect(560);
    hook.rerender({ key: 'note-4' });
    expect(view.scrollTo).toHaveBeenCalledOnce();
    expect(view.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 470 }));
    expect(refs.programmaticScrollRef.current).toBe(true);
  });
});
