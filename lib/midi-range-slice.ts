/**
 * Cut a measure range out of a score's MIDI export, so a model that works on whole files
 * (the Anticipatory Music Transformer Space accompanies to the end of whatever it is sent)
 * sees only the selected bars.
 *
 * Measure boundaries come from the engine (each measure's actual length), not from the
 * MIDI: a pickup or an irregular bar shifts every later bar, and the time-signature events
 * in a MIDI file cannot show that.
 */

import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';

export type MeasureFraction = { numerator: number; denominator: number };

/** `n/d` as the engine writes measure lengths and time signatures. */
export function parseMeasureFraction(text: string): MeasureFraction | null {
  const match = /^\s*(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? { numerator, denominator } : null;
}

/** Tick at which each measure starts, plus the end of the last one (length + 1 entries). */
export function measureStartTicks(lengths: MeasureFraction[], ticksPerBeat: number): number[] {
  const starts = [0];
  let tick = 0;
  for (const { numerator, denominator } of lengths) {
    tick += Math.round((numerator / denominator) * 4 * ticksPerBeat);
    starts.push(tick);
  }
  return starts;
}

export type MidiTrackSummary = {
  index: number;
  name: string;
  noteCount: number;
  channels: number[];
};

const trackNameOf = (track: MidiEvent[]) => {
  const named = track.find((e) => e.type === 'trackName');
  return named && 'text' in named ? named.text : '';
};
const isSounding = (e: MidiEvent) => e.type === 'noteOn' && e.velocity > 0;

/** The tracks of a MIDI file that play notes, for choosing the melody. */
export function listMidiTracks(bytes: Uint8Array): MidiTrackSummary[] {
  return parseMidi(bytes)
    .tracks.map((track, index) => {
      const channels = new Set<number>();
      let noteCount = 0;
      for (const e of track) {
        if (isSounding(e) && 'channel' in e) {
          channels.add(e.channel);
          noteCount += 1;
        }
      }
      return {
        index,
        name: trackNameOf(track),
        noteCount,
        channels: [...channels].sort((a, b) => a - b),
      };
    })
    .filter((t) => t.noteCount > 0);
}

export function midiTicksPerBeat(bytes: Uint8Array): number {
  const perBeat = parseMidi(bytes).header.ticksPerBeat;
  if (!perBeat) throw new Error('SMPTE-timed MIDI cannot be cut by measure.');
  return perBeat;
}

// State that sounds from before the range and must be restated at its start.
const carriedKey = (e: MidiEvent): string | null => {
  switch (e.type) {
    case 'setTempo':
    case 'timeSignature':
    case 'keySignature':
    case 'trackName':
    case 'instrumentName':
      return e.type;
    case 'programChange':
    case 'pitchBend':
    case 'channelAftertouch':
      return `${e.type}:${e.channel}`;
    case 'controller':
      return `controller:${e.channel}:${e.controllerType}`;
    default:
      return null;
  }
};

function sliceTrack(track: MidiEvent[], start: number, end: number): MidiEvent[] {
  const carried = new Map<string, MidiEvent>();
  const kept: { tick: number; event: MidiEvent }[] = [];
  // Notes sounding in the range, and notes begun before it whose release must be ignored.
  const open = new Map<string, number>();
  const skipped = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, by: number) =>
    map.set(key, (map.get(key) ?? 0) + by);

  let tick = 0;
  for (const event of track) {
    tick += event.deltaTime;
    if (event.type === 'endOfTrack') continue;
    if (event.type === 'noteOn' || event.type === 'noteOff') {
      const key = `${event.channel}:${event.noteNumber}`;
      if (isSounding(event)) {
        if (tick < start) bump(skipped, key, 1);
        else if (tick < end) {
          bump(open, key, 1);
          kept.push({ tick: tick - start, event });
        }
      } else if (skipped.get(key)) {
        bump(skipped, key, -1);
      } else if (open.get(key)) {
        bump(open, key, -1);
        kept.push({ tick: Math.min(tick, end) - start, event });
      }
      continue;
    }
    const key = carriedKey(event);
    if (tick < start) {
      if (key) carried.set(key, event);
    } else if (tick < end) {
      kept.push({ tick: tick - start, event });
    }
  }

  // Anything still sounding at the end of the range is released there.
  for (const [key, count] of open) {
    const [channel, noteNumber] = key.split(':').map(Number);
    for (let i = 0; i < count; i += 1) {
      kept.push({
        tick: end - start,
        event: { deltaTime: 0, type: 'noteOff', channel, noteNumber, velocity: 0 },
      });
    }
  }

  const ordered = [
    ...[...carried.values()].map((event) => ({ tick: 0, event })),
    ...kept.sort((a, b) => a.tick - b.tick),
  ];
  let previous = 0;
  const out = ordered.map(({ tick: at, event }) => {
    const copy = { ...event, deltaTime: at - previous } as MidiEvent;
    previous = at;
    return copy;
  });
  out.push({ deltaTime: end - start - previous, type: 'endOfTrack', meta: true });
  return out;
}

/**
 * The part of a MIDI file between two ticks, moved to start at 0. Tempo, meter, key,
 * programs and controllers in force at the start are restated there; notes begun before
 * the range are left out, and notes still sounding at its end are cut off there.
 */
export function sliceMidiToTicks(
  bytes: Uint8Array,
  startTick: number,
  endTick: number,
): Uint8Array {
  if (!(endTick > startTick) || startTick < 0) {
    throw new Error(`Invalid MIDI range ${startTick}..${endTick}.`);
  }
  const midi = parseMidi(bytes);
  const sliced: MidiData = {
    header: { ...midi.header },
    tracks: midi.tracks.map((track) => sliceTrack(track, startTick, endTick)),
  };
  return Uint8Array.from(writeMidi(sliced));
}
