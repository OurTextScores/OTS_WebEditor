import { describe, expect, it } from 'vitest';
import { parseMidi, writeMidi, type MidiEvent } from 'midi-file';
import {
  listMidiTracks,
  measureStartTicks,
  parseMeasureFraction,
  sliceMidiToTicks,
} from '../lib/midi-range-slice';

const PER_BEAT = 480;
const bytes = (tracks: MidiEvent[][]) =>
  Uint8Array.from(
    writeMidi({ header: { format: 1, numTracks: tracks.length, ticksPerBeat: PER_BEAT }, tracks }),
  );

const timedOf = (track: MidiEvent[]) => {
  let tick = 0;
  return track.map((e) => {
    tick += e.deltaTime;
    return { tick, type: e.type, note: 'noteNumber' in e ? e.noteNumber : undefined, e };
  });
};

describe('measure arithmetic', () => {
  it('parses engine fractions and ignores trailing signature fields', () => {
    expect(parseMeasureFraction('3/4|0|1|...')).toEqual({ numerator: 3, denominator: 4 });
    expect(parseMeasureFraction('x')).toBeNull();
    expect(parseMeasureFraction('0/4')).toBeNull();
  });

  it('places bars after a pickup by their actual length', () => {
    const lengths = [
      { numerator: 1, denominator: 4 },
      { numerator: 4, denominator: 4 },
      { numerator: 3, denominator: 4 },
    ];
    expect(measureStartTicks(lengths, PER_BEAT)).toEqual([0, 480, 2400, 3840]);
  });
});

describe('sliceMidiToTicks', () => {
  // Conductor: 120 bpm, changing to 60 bpm at beat 2. Melody: a note per beat for 4 beats,
  // with a held note from beat 0 to beat 3 and a program change before the range.
  const source = bytes([
    [
      { deltaTime: 0, type: 'setTempo', meta: true, microsecondsPerBeat: 500_000 },
      {
        deltaTime: 0,
        type: 'timeSignature',
        meta: true,
        numerator: 4,
        denominator: 4,
        metronome: 24,
        thirtyseconds: 8,
      },
      { deltaTime: 2 * PER_BEAT, type: 'setTempo', meta: true, microsecondsPerBeat: 1_000_000 },
      { deltaTime: 0, type: 'endOfTrack', meta: true },
    ],
    [
      { deltaTime: 0, type: 'trackName', meta: true, text: 'Melody' },
      { deltaTime: 0, type: 'programChange', channel: 0, programNumber: 40 },
      { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 48, velocity: 70 },
      ...[60, 62, 64, 65].flatMap((n): MidiEvent[] => [
        { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: n, velocity: 80 },
        { deltaTime: PER_BEAT, type: 'noteOff', channel: 0, noteNumber: n, velocity: 0 },
      ]),
      { deltaTime: 0, type: 'noteOff', channel: 0, noteNumber: 48, velocity: 0 },
      { deltaTime: 0, type: 'endOfTrack', meta: true },
    ],
  ]);

  it('keeps the notes begun in the range, restating tempo, meter and program at its start', () => {
    const out = parseMidi(sliceMidiToTicks(source, PER_BEAT, 3 * PER_BEAT));
    const conductor = timedOf(out.tracks[0]);
    expect(conductor.map((x) => [x.tick, x.type])).toEqual([
      [0, 'setTempo'],
      [0, 'timeSignature'],
      [PER_BEAT, 'setTempo'],
      [2 * PER_BEAT, 'endOfTrack'],
    ]);
    const melody = timedOf(out.tracks[1]);
    expect(melody.slice(0, 2).map((x) => x.type)).toEqual(['trackName', 'programChange']);
    expect(melody[1].e).toMatchObject({ programNumber: 40 });
    const notes = melody.filter((x) => x.type === 'noteOn').map((x) => [x.tick, x.note]);
    // The held 48 began before the range, so it is not sent; 62 and 64 are.
    expect(notes).toEqual([
      [0, 62],
      [PER_BEAT, 64],
    ]);
    const offs = melody.filter((x) => x.type === 'noteOff').map((x) => [x.tick, x.note]);
    expect(offs).toEqual([
      [PER_BEAT, 62],
      [2 * PER_BEAT, 64],
    ]);
  });

  it('cuts off a note still sounding at the end of the range', () => {
    const out = parseMidi(sliceMidiToTicks(source, 0, PER_BEAT / 2));
    const melody = timedOf(out.tracks[1]);
    const offs = melody.filter((x) => x.type === 'noteOff').map((x) => [x.tick, x.note]);
    expect(offs.sort()).toEqual([
      [PER_BEAT / 2, 48],
      [PER_BEAT / 2, 60],
    ]);
  });

  it('rejects an empty range', () => {
    expect(() => sliceMidiToTicks(source, 10, 10)).toThrow(/Invalid MIDI range/);
  });

  it('lists the tracks that play notes', () => {
    expect(listMidiTracks(source)).toEqual([
      { index: 1, name: 'Melody', noteCount: 5, channels: [0] },
    ]);
  });
});
