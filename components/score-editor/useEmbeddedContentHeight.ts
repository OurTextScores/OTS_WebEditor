import { useLayoutEffect } from 'react';

/** Keep content-sized embeds on the host's scrollbar once their content fits. */
export function useEmbeddedContentHeight(enabled: boolean): void {
  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined' || window.parent === window) return;
    const root = document.documentElement;
    const wrapper = document.querySelector('main');
    const restore = {
      rootOverflow: root.style.overflow,
      rootGutter: root.style.scrollbarGutter,
      bodyOverflow: document.body.style.overflow,
      wrapperMinHeight: wrapper instanceof HTMLElement ? wrapper.style.minHeight : '',
    };
    if (wrapper instanceof HTMLElement) wrapper.style.minHeight = '0';
    // Reserve the same width before and after the host resizes the frame.
    // `clip` drops a stable gutter, so use `hidden` on the root when it fits:
    // neither lets the user scroll, but hidden retains the reserved gutter.
    // Otherwise Across -> Stacked changes width, music scale and height in a loop.
    root.style.scrollbarGutter = 'stable';
    const post = () => {
      const height = Math.ceil(document.body.scrollHeight);
      const fits = window.innerHeight >= height;
      root.style.overflow = fits ? 'hidden' : '';
      document.body.style.overflow = fits ? 'clip' : '';
      window.parent.postMessage({ type: 'ots-compare-height', height }, '*');
    };
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    window.addEventListener('resize', post);
    post();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', post);
      root.style.overflow = restore.rootOverflow;
      root.style.scrollbarGutter = restore.rootGutter;
      document.body.style.overflow = restore.bodyOverflow;
      if (wrapper instanceof HTMLElement) wrapper.style.minHeight = restore.wrapperMinHeight;
    };
  }, [enabled]);
}
