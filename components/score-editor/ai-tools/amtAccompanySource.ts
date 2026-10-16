/**
 * What the AMT accompaniment tool sends: the open score's MIDI, cut to the selected bars,
 * plus the bar layout needed to put the generated parts back at those bars.
 */

import {
  listMidiTracks,
  measureStartTicks,
  midiTicksPerBeat,
  parseMeasureFraction,
  sliceMidiToTicks,
  type MidiTrackSummary,
} from '../../../lib/midi-range-slice';
import type { ScoreMeasure } from '../../../lib/musicxml-part-placement';
import type { Score } from '../../../lib/webmscore-loader';

export type AccompanySource = {
  midiBytes: Uint8Array;
  measures: ScoreMeasure[];
  /** Zero-based, inclusive. */
  range: { start: number; end: number };
  /** Tracks of the MIDI that play notes; `index` is what the service's `melodyTrack` takes. */
  tracks: MidiTrackSummary[];
  warnings: string[];
};

type AccompanyScore = Pick<
  Score,
  'saveMidi' | 'measureSignatures' | 'irregularMeasures' | 'selectionMeasureRange'
>;

/** Each bar's time signature and actual length, from the engine. */
async function readMeasures(score: AccompanyScore): Promise<ScoreMeasure[]> {
  if (!score.measureSignatures) {
    throw new Error('This engine build cannot report bar lengths.');
  }
  const signatures = await score.measureSignatures(0);
  const irregular = new Map(
    ((await score.irregularMeasures?.()) ?? []).map((m) => [
      m.index,
      parseMeasureFraction(m.actual),
    ]),
  );
  return signatures.map((signature, index) => {
    const nominal = parseMeasureFraction(signature);
    if (!nominal) throw new Error(`Bar ${index + 1} has no readable time signature.`);
    return { nominal, actual: irregular.get(index) ?? nominal };
  });
}

const isShort = (m: ScoreMeasure) =>
  m.actual.numerator / m.actual.denominator < m.nominal.numerator / m.nominal.denominator;

/**
 * Reads the score for accompaniment: the selected bars (or the whole score), its MIDI
 * without repeats expanded (so ticks follow the bars), and the tracks to pick a melody from.
 */
export async function readAccompanySource(score: AccompanyScore): Promise<AccompanySource> {
  if (!score.saveMidi) throw new Error('This engine build cannot export MIDI.');
  const measures = await readMeasures(score);
  if (measures.length === 0) throw new Error('The score has no bars.');
  const midiBytes = new Uint8Array(await score.saveMidi(false, true));
  const selection = await score.selectionMeasureRange?.();
  const warnings: string[] = [];

  let start = selection ? selection.startMeasureIndex : 0;
  const end = selection ? selection.endMeasureIndex : measures.length - 1;
  // MIDI import lays bars on the time signature, so a short opening bar would shift every
  // generated bar after it.
  if (start === 0 && isShort(measures[0]) && end > 0) {
    start = 1;
    warnings.push('The pickup bar is left out; accompaniment starts at the first full bar.');
  }
  if (measures.slice(start + 1, end + 1).some(isShort)) {
    warnings.push(
      'The range contains a bar shorter than its time signature; generated bars after it may not line up.',
    );
  }

  return {
    midiBytes,
    measures,
    range: { start, end },
    tracks: listMidiTracks(midiBytes),
    warnings,
  };
}

/** The source MIDI cut to its range, starting at 0. */
export function sliceAccompanySource(source: AccompanySource): Uint8Array {
  const ticks = measureStartTicks(
    source.measures.map((m) => m.actual),
    midiTicksPerBeat(source.midiBytes),
  );
  return sliceMidiToTicks(source.midiBytes, ticks[source.range.start], ticks[source.range.end + 1]);
}
