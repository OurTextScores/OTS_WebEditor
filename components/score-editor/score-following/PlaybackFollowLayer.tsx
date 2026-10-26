import React from 'react';
import type { PlaybackCursor } from '../../../lib/playback/score-following';
import { usePlaybackFollowLayer, type FollowLayerOptions } from './usePlaybackFollowLayer';
import { PlaybackHighlightLayer } from './PlaybackHighlightLayer';

const markerStyle = (cursor: PlaybackCursor): React.CSSProperties =>
  cursor.kind === 'segment'
    ? { left: cursor.x - 1, top: cursor.y, width: 3, height: cursor.height }
    : { left: cursor.x, top: cursor.y, width: cursor.width, height: cursor.height };

/**
 * The playback cursor over the engraved page: a segment-leading bar across the system (or a measure outline when
 * only measure positions exist). Pointer-transparent, inside the zoomed wrapper, so it never takes an editing gesture;
 * a white outline keeps it visible over selection colours without relying on colour alone.
 */
export function PlaybackFollowLayer(props: FollowLayerOptions) {
  const { cursor, step, seekMarker, barRef, continuous } = usePlaybackFollowLayer(props);
  return (
    <>
      <PlaybackHighlightLayer {...props} />
      {continuous && (
        <div
          ref={barRef}
          // One cursor element either way: the moving bar carries the discrete segment it is in.
          data-testid="playback-cursor"
          data-kind="continuous"
          data-element-id={step?.elementId}
          data-start-ms={step?.startMs}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-20 hidden bg-accent shadow-[0_0_0_1px_white]"
        />
      )}
      {seekMarker && (
        <div
          data-testid="playback-seek-marker"
          aria-hidden="true"
          className="pointer-events-none absolute z-20 rounded-sm bg-accent/20 ring-2 ring-accent motion-safe:animate-pulse"
          style={{ ...markerStyle(seekMarker), width: Math.max(12, seekMarker.width) }}
        />
      )}
      {cursor && (
        <div
          data-testid="playback-cursor"
          data-kind={cursor.kind}
          data-element-id={cursor.elementId}
          data-start-ms={cursor.startMs}
          aria-hidden="true"
          className={`pointer-events-none absolute z-20 ${
            cursor.kind === 'segment'
              ? 'bg-accent shadow-[0_0_0_1px_white]'
              : 'border-2 border-dashed border-accent bg-accent/10'
          }`}
          style={markerStyle(cursor)}
        />
      )}
    </>
  );
}
