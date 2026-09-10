import type { PlaybackTimeline, PlaybackTimelineOccurrence, Positions } from '../webmscore-loader';

export function timelineFromPositions(
  positions: Positions | null,
  durationMs = 0,
): PlaybackTimeline {
  const starts = (positions?.events ?? [])
    .filter((event) => Number.isFinite(event.position) && Number.isFinite(event.elid))
    .map((event, index) => ({
      occurrenceIndex: index,
      measureIndex: event.elid,
      startMs: Math.max(0, event.position),
    }))
    .sort(
      (left, right) => left.startMs - right.startMs || left.occurrenceIndex - right.occurrenceIndex,
    );
  const learnedDuration = Math.max(durationMs, starts.at(-1)?.startMs ?? 0);
  const occurrences = starts.map<PlaybackTimelineOccurrence>((event, index) => ({
    ...event,
    occurrenceIndex: index,
    endMs: Math.max(event.startMs, starts[index + 1]?.startMs ?? learnedDuration),
  }));
  return {
    schemaVersion: 1,
    durationMs: learnedDuration,
    renderDurationMs: learnedDuration,
    occurrences,
  };
}

export function occurrenceAtTime(
  timeline: PlaybackTimeline | null,
  timeMs: number,
): PlaybackTimelineOccurrence | null {
  const occurrences = timeline?.occurrences ?? [];
  if (occurrences.length === 0) return null;
  const target = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  let low = 0;
  let high = occurrences.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (occurrences[middle].startMs <= target) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return occurrences[result] ?? null;
}

export function occurrenceForMeasure(
  timeline: PlaybackTimeline | null,
  measureIndex: number,
  currentTimeMs: number,
): PlaybackTimelineOccurrence | null {
  const matches = (timeline?.occurrences ?? []).filter(
    (occurrence) => occurrence.measureIndex === measureIndex,
  );
  return matches.find((occurrence) => occurrence.startMs >= currentTimeMs) ?? matches[0] ?? null;
}

export function formatPlaybackTime(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(valueMs) ? valueMs : 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
