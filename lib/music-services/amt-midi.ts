/**
 * MIDI preparation and post-processing for the Anticipatory Music Transformer Space.
 *
 * The Space picks the melody by General MIDI program (every note on that program is held
 * fixed), and returns the input file with one `Generated <instrument>` track added per new
 * part. So before the call the melody part needs a program no other part plays, and after
 * it only the generated tracks (plus the tempo/meter/key map they were placed on) are kept.
 * See docs/private/music-ai-specialists/amt-infilling-hf-space-runbook.md.
 */

import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';

export const DRUM_CHANNEL = 9;
export const GENERATED_TRACK_PREFIX = 'Generated ';

/** General MIDI program names by program number, exactly as the Space's dropdown spells them. */
export const GM_PROGRAMS = [
  'Acoustic Grand Piano',
  'Bright Acoustic Piano',
  'Electric Grand Piano',
  'Honky-tonk Piano',
  'Electric Piano 1',
  'Electric Piano 2',
  'Harpsichord',
  'Clavinet',
  'Celesta',
  'Glockenspiel',
  'Music Box',
  'Vibraphone',
  'Marimba',
  'Xylophone',
  'Tubular Bells',
  'Dulcimer',
  'Drawbar Organ',
  'Percussive Organ',
  'Rock Organ',
  'Church Organ',
  'Reed Organ',
  'Accordion',
  'Harmonica',
  'Tango Accordion',
  'Acoustic Guitar (nylon)',
  'Acoustic Guitar (steel)',
  'Electric Guitar (jazz)',
  'Electric Guitar (clean)',
  'Electric Guitar (muted)',
  'Overdriven Guitar',
  'Distortion Guitar',
  'Guitar Harmonics',
  'Acoustic Bass',
  'Electric Bass (finger)',
  'Electric Bass (pick)',
  'Fretless Bass',
  'Slap Bass 1',
  'Slap Bass 2',
  'Synth Bass 1',
  'Synth Bass 2',
  'Violin',
  'Viola',
  'Cello',
  'Contrabass',
  'Tremolo Strings',
  'Pizzicato Strings',
  'Orchestral Harp',
  'Timpani',
  'String Ensemble 1',
  'String Ensemble 2',
  'Synth Strings 1',
  'Synth Strings 2',
  'Choir Aahs',
  'Voice Oohs',
  'Synth Voice',
  'Orchestra Hit',
  'Trumpet',
  'Trombone',
  'Tuba',
  'Muted Trumpet',
  'French Horn',
  'Brass Section',
  'Synth Brass 1',
  'Synth Brass 2',
  'Soprano Sax',
  'Alto Sax',
  'Tenor Sax',
  'Baritone Sax',
  'Oboe',
  'English Horn',
  'Bassoon',
  'Clarinet',
  'Piccolo',
  'Flute',
  'Recorder',
  'Pan Flute',
  'Blown Bottle',
  'Shakuhachi',
  'Whistle',
  'Ocarina',
  'Lead 1 (square)',
  'Lead 2 (sawtooth)',
  'Lead 3 (calliope)',
  'Lead 4 (chiff)',
  'Lead 5 (charang)',
  'Lead 6 (voice)',
  'Lead 7 (fifths)',
  'Lead 8 (bass + lead)',
  'Pad 1 (new age)',
  'Pad 2 (warm)',
  'Pad 3 (polysynth)',
  'Pad 4 (choir)',
  'Pad 5 (bowed)',
  'Pad 6 (metallic)',
  'Pad 7 (halo)',
  'Pad 8 (sweep)',
  'FX 1 (rain)',
  'FX 2 (soundtrack)',
  'FX 3 (crystal)',
  'FX 4 (atmosphere)',
  'FX 5 (brightness)',
  'FX 6 (goblins)',
  'FX 7 (echoes)',
  'FX 8 (sci-fi)',
  'Sitar',
  'Banjo',
  'Shamisen',
  'Koto',
  'Kalimba',
  'Bagpipe',
  'Fiddle',
  'Shanai',
  'Tinkle Bell',
  'Agogo',
  'Steel Drums',
  'Woodblock',
  'Taiko Drum',
  'Melodic Tom',
  'Synth Drum',
  'Reverse Cymbal',
  'Guitar Fret Noise',
  'Breath Noise',
  'Seashore',
  'Bird Tweet',
  'Telephone Ring',
  'Helicopter',
  'Applause',
  'Gunshot',
] as const;

// Programs tried, in order, when the melody has to be moved off a program another part plays.
// Single-line melodic instruments first, so the model reads the part as a melody.
const MELODY_PROGRAM_PREFERENCE = [73, 68, 71, 40, 56, 65, 72, 74];

export class AmtMidiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmtMidiError';
  }
}

export function readMidi(bytes: Uint8Array): MidiData {
  try {
    return parseMidi(bytes);
  } catch (err) {
    throw new AmtMidiError(
      `Input is not a readable MIDI file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function encodeMidi(midi: MidiData): Uint8Array {
  return Uint8Array.from(writeMidi(midi));
}

type TimedEvent = { tick: number; event: MidiEvent };

function timed(track: MidiEvent[]): TimedEvent[] {
  let tick = 0;
  return track.map((event) => {
    tick += event.deltaTime;
    return { tick, event };
  });
}

function untimed(events: TimedEvent[]): MidiEvent[] {
  let previous = 0;
  return events.map(({ tick, event }) => {
    const copy = { ...event, deltaTime: tick - previous } as MidiEvent;
    previous = tick;
    return copy;
  });
}

export function trackName(track: MidiEvent[]): string {
  const named = track.find((e) => e.type === 'trackName');
  return named && 'text' in named ? named.text : '';
}

const isSounding = (e: MidiEvent) => e.type === 'noteOn' && e.velocity > 0;
const channelOf = (e: MidiEvent): number | null => ('channel' in e ? e.channel : null);

/** The channels a track plays notes on, drums excluded. */
function noteChannels(track: MidiEvent[]): Set<number> {
  const channels = new Set<number>();
  for (const e of track) {
    const channel = channelOf(e);
    if (isSounding(e) && channel !== null && channel !== DRUM_CHANNEL) channels.add(channel);
  }
  return channels;
}

/**
 * Every program a channel's notes can sound with: each program change on it, plus piano
 * for notes before the first change. Programs belong to channels, not tracks, which is
 * how the Space reads them too.
 */
function channelPrograms(midi: MidiData): Map<number, Set<number>> {
  const changes = new Map<number, { tick: number; program: number }[]>();
  const firstNote = new Map<number, number>();
  for (const track of midi.tracks) {
    for (const { tick, event } of timed(track)) {
      const channel = channelOf(event);
      if (channel === null) continue;
      if (event.type === 'programChange') {
        const list = changes.get(channel) ?? [];
        list.push({ tick, program: event.programNumber });
        changes.set(channel, list);
      } else if (isSounding(event)) {
        firstNote.set(channel, Math.min(firstNote.get(channel) ?? tick, tick));
      }
    }
  }
  const programs = new Map<number, Set<number>>();
  for (const [channel, first] of firstNote) {
    const list = changes.get(channel) ?? [];
    const set = new Set(list.map((c) => c.program));
    if (!list.some((c) => c.tick <= first)) set.add(0);
    programs.set(channel, set);
  }
  return programs;
}

export type MelodySelection = {
  trackIndex?: number;
  trackName?: string;
};

export type PreparedMelody = {
  midi: MidiData;
  trackIndex: number;
  trackName: string;
  program: number;
  instrument: string;
  /** The melody's original program(s), when it had to be moved to a unique one. */
  remappedFrom: number[] | null;
  warnings: string[];
};

function resolveMelodyTrack(midi: MidiData, selection: MelodySelection): number {
  const tracks = midi.tracks;
  if (typeof selection.trackIndex === 'number') {
    if (!Number.isInteger(selection.trackIndex) || !tracks[selection.trackIndex]) {
      throw new AmtMidiError(
        `melodyTrack ${selection.trackIndex} is out of range (the file has ${tracks.length} tracks).`,
      );
    }
    return selection.trackIndex;
  }
  if (selection.trackName) {
    const wanted = selection.trackName.trim().toLowerCase();
    const index = tracks.findIndex((t) => trackName(t).trim().toLowerCase() === wanted);
    if (index < 0) {
      const names = tracks.map(trackName).filter(Boolean);
      throw new AmtMidiError(
        `No track is named "${selection.trackName}". Track names: ${names.join(', ') || 'none'}.`,
      );
    }
    return index;
  }
  // Default to the first part with pitched notes, which is the top staff in a MuseScore export.
  const index = tracks.findIndex((t) => noteChannels(t).size > 0);
  if (index < 0) throw new AmtMidiError('The file has no pitched notes to use as a melody.');
  return index;
}

/**
 * Picks the melody track and makes sure its program is one no other part plays, moving it
 * to a free melodic program when needed, so the Space holds exactly that part fixed.
 */
export function prepareMelody(source: MidiData, selection: MelodySelection): PreparedMelody {
  const midi: MidiData = {
    header: { ...source.header },
    tracks: source.tracks.map((t) => t.map((e) => ({ ...e }) as MidiEvent)),
  };
  const warnings: string[] = [];
  const trackIndex = resolveMelodyTrack(midi, selection);
  const melodyChannels = noteChannels(midi.tracks[trackIndex]);
  if (melodyChannels.size === 0) {
    throw new AmtMidiError(
      `Track ${trackIndex} (${trackName(midi.tracks[trackIndex]) || 'unnamed'}) has no pitched notes to use as a melody.`,
    );
  }
  midi.tracks.forEach((track, index) => {
    if (index === trackIndex) return;
    if ([...noteChannels(track)].some((c) => melodyChannels.has(c))) {
      warnings.push(
        `Track ${index} (${trackName(track) || 'unnamed'}) shares a MIDI channel with the melody, so it is held fixed as melody too.`,
      );
    }
  });

  const programs = channelPrograms(midi);
  const melodyPrograms = new Set<number>();
  const otherPrograms = new Set<number>();
  for (const [channel, set] of programs) {
    if (channel === DRUM_CHANNEL) continue;
    for (const p of set) (melodyChannels.has(channel) ? melodyPrograms : otherPrograms).add(p);
  }

  const [only] = melodyPrograms;
  if (melodyPrograms.size === 1 && !otherPrograms.has(only)) {
    return {
      midi,
      trackIndex,
      trackName: trackName(midi.tracks[trackIndex]),
      program: only,
      instrument: GM_PROGRAMS[only],
      remappedFrom: null,
      warnings,
    };
  }

  const used = new Set([...otherPrograms, ...melodyPrograms]);
  const target =
    MELODY_PROGRAM_PREFERENCE.find((p) => !used.has(p)) ??
    Array.from({ length: 128 }, (_, p) => p).find((p) => !otherPrograms.has(p));
  if (target === undefined) {
    throw new AmtMidiError(
      'Every General MIDI program is in use, so the melody cannot be told apart.',
    );
  }

  for (const track of midi.tracks) {
    for (const e of track) {
      if (e.type === 'programChange' && melodyChannels.has(e.channel)) e.programNumber = target;
    }
  }
  // Notes before the first program change would otherwise still sound as piano.
  const leading: MidiEvent[] = [...melodyChannels].map((channel) => ({
    deltaTime: 0,
    type: 'programChange',
    channel,
    programNumber: target,
  }));
  midi.tracks[trackIndex] = [...leading, ...midi.tracks[trackIndex]];

  return {
    midi,
    trackIndex,
    trackName: trackName(midi.tracks[trackIndex]),
    program: target,
    instrument: GM_PROGRAMS[target],
    remappedFrom: [...melodyPrograms].sort((a, b) => a - b),
    warnings,
  };
}

/** Length of the file in seconds, through its own tempo map (120 bpm until the first change). */
export function midiDurationSeconds(midi: MidiData): number {
  const perBeat = midi.header.ticksPerBeat;
  if (!perBeat) {
    throw new AmtMidiError(
      'SMPTE-timed MIDI files are not supported; export with a ticks-per-beat division.',
    );
  }
  const tempos: TimedEvent[] = [];
  let end = 0;
  for (const track of midi.tracks) {
    for (const item of timed(track)) {
      end = Math.max(end, item.tick);
      if (item.event.type === 'setTempo') tempos.push(item);
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  let seconds = 0;
  let tick = 0;
  let usPerBeat = 500_000;
  for (const { tick: at, event } of tempos) {
    if (at >= end) break;
    seconds += ((at - tick) * usPerBeat) / (1e6 * perBeat);
    tick = at;
    if (event.type === 'setTempo') usPerBeat = event.microsecondsPerBeat;
  }
  return seconds + ((end - tick) * usPerBeat) / (1e6 * perBeat);
}

export type GeneratedPart = {
  trackName: string;
  instrument: string;
  program: number | null;
  channel: number | null;
  noteCount: number;
};

const MAP_EVENTS = new Set(['setTempo', 'timeSignature', 'keySignature']);

/**
 * Keeps only the Space's `Generated *` tracks, behind a conductor track carrying the
 * tempo, time-signature and key-signature events they were placed against.
 */
export function extractGeneratedTracks(output: MidiData): {
  midi: MidiData | null;
  parts: GeneratedPart[];
} {
  const generated = output.tracks.filter((t) => trackName(t).startsWith(GENERATED_TRACK_PREFIX));
  const parts = generated.map((track) => {
    const name = trackName(track);
    const programChange = track.find((e) => e.type === 'programChange');
    const firstNote = track.find(isSounding);
    return {
      trackName: name,
      instrument: name.slice(GENERATED_TRACK_PREFIX.length),
      program: programChange?.type === 'programChange' ? programChange.programNumber : null,
      channel: firstNote ? channelOf(firstNote) : null,
      noteCount: track.filter(isSounding).length,
    };
  });
  if (generated.length === 0) return { midi: null, parts };

  const map = output.tracks
    .filter((t) => !generated.includes(t))
    .flatMap((t) => timed(t).filter(({ event }) => MAP_EVENTS.has(event.type)))
    .sort((a, b) => a.tick - b.tick);
  const conductor = [
    ...untimed(map),
    { deltaTime: 0, type: 'endOfTrack', meta: true } as MidiEvent,
  ];

  return {
    midi: {
      header: { ...output.header, format: 1, numTracks: generated.length + 1 },
      tracks: [conductor, ...generated],
    },
    parts,
  };
}
