import { readPlayerPreference } from '../../../lib/playback/player-preferences';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Score } from '../../../lib/webmscore-loader';

export type WarmupOptions = {
  score: Score | null;
  canWarmup?: () => boolean;
  runSerialized?: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  prepare: () => Promise<boolean>;
};

/** After edits: debounced, lower-priority work on the existing engine queue; never starts audio or fetches a font. */
export function useIdlePlaybackWarmup(options: WarmupOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  }, [options]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idle = useRef<number | null>(null);
  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (idle.current !== null) window.cancelIdleCallback?.(idle.current);
    idle.current = null;
  }, []);
  const schedule = useCallback(() => {
    cancel();
    if (!mounted.current) return;
    const epoch = generation.current;
    const score = latest.current.score;
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = () =>
        epoch === generation.current &&
        latest.current.score === score &&
        !!score &&
        readPlayerPreference('ots-playback-idle-warmup') !== '0' &&
        latest.current.canWarmup?.() === true &&
        document.visibilityState !== 'hidden';
      const enqueue = () => {
        idle.current = null;
        if (!current() || !latest.current.runSerialized) return;
        void latest.current
          .runSerialized(
            async () => (current() ? latest.current.prepare() : false),
            'playback:idle-warmup',
          )
          .catch(() => {});
      };
      if (window.requestIdleCallback) idle.current = window.requestIdleCallback(enqueue);
      else enqueue();
    }, 1000);
  }, [cancel]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [options.score, cancel]);
  return { schedule, cancel };
}
