import { usePlaybackHighlights } from './usePlaybackHighlights';
import type { FollowLayerOptions } from './usePlaybackFollowLayer';

export function PlaybackHighlightLayer(props: FollowLayerOptions) {
  const measureRef = usePlaybackHighlights(props);
  return (
    <div
      ref={measureRef}
      data-testid="playback-measure-highlight"
      aria-hidden="true"
      className="pointer-events-none absolute z-10 hidden border border-accent/40 bg-accent/10"
    />
  );
}
