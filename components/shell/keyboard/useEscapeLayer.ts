'use client';

import { useEffect, useRef } from 'react';
import { pushEscapeLayer } from './escapeLayers';

/** Registers a layer while `active`. The handler may change every render. */
export function useEscapeLayer(active: boolean, priority: number, onEscape: () => void): void {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(priority, () => latest.current());
  }, [active, priority]);
}
