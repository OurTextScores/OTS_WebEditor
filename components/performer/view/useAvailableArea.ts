import { useEffect, useState, type RefObject } from 'react';
import type { Viewport } from '../session/devicePageStyle';

/** The size of the element the page is laid out into (inside the safe areas), following rotation and resizing. */
export function useAvailableArea(ref: RefObject<HTMLElement | null>): Viewport {
  const [area, setArea] = useState<Viewport>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArea((previous) =>
        Math.round(previous.width) === Math.round(width) &&
        Math.round(previous.height) === Math.round(height)
          ? previous
          : { width: Math.round(width), height: Math.round(height) },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return area;
}
