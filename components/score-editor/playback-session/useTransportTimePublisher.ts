import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { publishTransportTime } from '../../../lib/playback/transport-time';

const INTERVAL_MS = 250;

type TimeSource = {
  positionRef: MutableRefObject<number>;
  subscribePosition: (notify: () => void) => () => void;
  /** Re-published on each transport state change (stop, end), not only on position ticks. */
  state: string;
  durationRef: MutableRefObject<number>;
  playbackOptions: { revision: number } | null;
};

/** Feeds the header time label from position ticks, at most four times a second. */
export function useTransportTimePublisher(source: TimeSource) {
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const { subscribePosition, state } = source;
  const revision = source.playbackOptions?.revision ?? 0;
  useEffect(() => {
    let last = 0;
    return subscribePosition(() => {
      const now = performance.now();
      if (now - last < INTERVAL_MS) return;
      last = now;
      publishTransportTime(latest.current.positionRef.current, latest.current.durationRef.current);
    });
  }, [subscribePosition]);
  useEffect(() => {
    publishTransportTime(latest.current.positionRef.current, latest.current.durationRef.current);
  }, [revision, state]);
}
