import { useEffect, type MutableRefObject } from 'react';
import type { PlaybackSessionOwner, TransportPhase } from './session-owner';
import { presentationContextTime, scoreTimeAt } from './transport-clock';

/** Presentation follows audio output; scheduling/count-in still use the context's scheduling clock. */
export function useTransportPresentation(options: {
  owner: PlaybackSessionOwner;
  contextRef: MutableRefObject<AudioContext | null>;
  playing: boolean;
  drainingRef: MutableRefObject<boolean>;
  publishPosition: (ms: number) => void;
  publishPhase: (phase: TransportPhase) => void;
}) {
  const { owner, contextRef, playing, drainingRef, publishPosition, publishPhase } = options;
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function update() {
      const context = contextRef.current;
      const anchor = owner.clockRef.current;
      if (context && anchor) {
        const aligned = presentationContextTime(context);
        const seconds = scoreTimeAt(anchor, aligned);
        if (seconds !== null) publishPosition(seconds * 1000);
        if (owner.phaseRef.current === 'count-in' && aligned >= anchor.contextTime) {
          owner.phaseRef.current = drainingRef.current ? 'draining' : 'playing';
          publishPhase(owner.phaseRef.current);
        }
      }
      frame = requestAnimationFrame(update);
    });
    return () => cancelAnimationFrame(frame);
  }, [owner, contextRef, playing, drainingRef, publishPosition, publishPhase]);
}
