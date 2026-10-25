import type { Score, SynthAudioBatchIterator } from '../../../lib/webmscore-loader';
import type { PlaybackSessionOwner } from '../../../lib/playback/session-owner';
import type { CompareSide, CompareTransportState } from './compare-types';
import type { CompareStreamTarget } from './useCompareTransport';

export function compareStreamTarget(
  side: CompareSide,
  session: PlaybackSessionOwner,
  attempt: number,
  setPlaying: (playing: boolean) => void,
  setPaused: (paused: boolean) => void,
): CompareStreamTarget {
  return {
    sourcesRef: session.sourcesRef,
    iteratorRef: session.iteratorRef,
    generationRef: session.generationRef,
    setIsPlaying: (playing) => {
      if (!session.isCurrent(attempt)) return;
      session.phaseRef.current = playing ? 'playing' : 'ended';
      setPlaying(playing);
    },
    setIsPaused: setPaused,
    onClockAnchor: (anchor) => {
      session.clockRef.current = anchor;
    },
    onBufferingChange: (buffering, seconds) => {
      if (!session.isCurrent(attempt)) return;
      session.setBuffering(buffering, seconds);
    },
    onDraining: () => {
      if (session.isCurrent(attempt)) session.phaseRef.current = 'draining';
    },
    debugLabel: `compare-${side}`,
  };
}

/** Mixed/older workers can advertise a proxy for an absent ranged native API. */
export async function prepareCompareIterator(options: {
  score: Score;
  range?: { startMeasureIndex: number; endMeasureIndex: number };
  batchSize: number;
  session: PlaybackSessionOwner;
  isCurrent: () => boolean;
  onRangeUnavailable: (error: unknown) => void;
}) {
  const { score, range, batchSize, session, isCurrent } = options;
  const prepare = (create: () => SynthAudioBatchIterator | Promise<SynthAudioBatchIterator>) =>
    session.prepareIterator(create, isCurrent);
  if (range && score.synthAudioBatchForMeasureRange) {
    try {
      return await prepare(() =>
        score.synthAudioBatchForMeasureRange!(
          range.startMeasureIndex,
          range.endMeasureIndex,
          batchSize,
        ),
      );
    } catch (error) {
      if (!isCurrent()) return null;
      options.onRangeUnavailable(error);
    }
  }
  if (!isCurrent() || !score.synthAudioBatch) return null;
  return prepare(() => score.synthAudioBatch!(0, batchSize));
}

/** Maps a shared session's resources onto the existing compare-side shell state. */
export function compareSideTransport(
  session: PlaybackSessionOwner,
  side: CompareSide,
  update: (side: CompareSide, patch: Partial<CompareTransportState>) => void,
) {
  return {
    sourcesRef: session.sourcesRef,
    iteratorRef: session.iteratorRef,
    generationRef: session.generationRef,
    setIsPlaying: (value: boolean) => update(side, { isPlaying: value }),
    setIsPaused: (value: boolean) => update(side, { isPaused: value }),
    setIsBusy: (value: boolean) => update(side, { isBusy: value }),
  };
}
