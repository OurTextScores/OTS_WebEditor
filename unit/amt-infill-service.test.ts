// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';

const mocked = vi.hoisted(() => ({
  convertMusicNotation: vi.fn(),
  createScoreArtifact: vi.fn(),
  getScoreArtifact: vi.fn(),
  resolveScoreContent: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/music-conversion', () => ({
  convertMusicNotation: mocked.convertMusicNotation,
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

vi.mock('../lib/music-services/score-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/music-services/score-request')>()),
  resolveScoreContent: mocked.resolveScoreContent,
}));

import { runMusicInfillService } from '../lib/music-services/amt-infill-service';
import { parseGradioSse, spaceHostFromId } from '../lib/music-services/amt-engine';
import { midiDurationSeconds } from '../lib/music-services/amt-midi';

const HOST = 'https://jhlusko-anticipatory-music-transformer.hf.space';
const PER_BEAT = 480;

/** A track of quarter notes on one channel, with an optional name and program. */
function part(opts: { name?: string; channel: number; program?: number; notes: number[] }) {
  const events: MidiEvent[] = [];
  if (opts.name) events.push({ deltaTime: 0, type: 'trackName', meta: true, text: opts.name });
  if (opts.program !== undefined) {
    events.push({
      deltaTime: 0,
      type: 'programChange',
      channel: opts.channel,
      programNumber: opts.program,
    });
  }
  for (const note of opts.notes) {
    events.push({
      deltaTime: 0,
      type: 'noteOn',
      channel: opts.channel,
      noteNumber: note,
      velocity: 80,
    });
    events.push({
      deltaTime: PER_BEAT,
      type: 'noteOff',
      channel: opts.channel,
      noteNumber: note,
      velocity: 0,
    });
  }
  events.push({ deltaTime: 0, type: 'endOfTrack', meta: true });
  return events;
}

function conductor(usPerBeat = 500_000): MidiEvent[] {
  return [
    { deltaTime: 0, type: 'setTempo', meta: true, microsecondsPerBeat: usPerBeat },
    {
      deltaTime: 0,
      type: 'timeSignature',
      meta: true,
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    },
    { deltaTime: 0, type: 'endOfTrack', meta: true },
  ];
}

function file(tracks: MidiEvent[][]): MidiData {
  return { header: { format: 1, numTracks: tracks.length, ticksPerBeat: PER_BEAT }, tracks };
}

const toBase64 = (midi: MidiData) => Buffer.from(writeMidi(midi)).toString('base64');

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];

/** Input as MuseScore exports it: conductor, melody, accompaniment, all piano by default. */
const pianoInput = () =>
  file([
    conductor(),
    part({ name: 'Melody', channel: 0, notes: SCALE }),
    part({ name: 'Piano', channel: 1, program: 0, notes: [48, 52, 55, 48] }),
  ]);

type SpaceScript = {
  sse?: string;
  status?: Partial<Record<'upload' | 'queue' | 'result' | 'download', number>>;
  output?: (input: MidiData) => MidiData;
};

/** The Space's output: the input plus a Generated track, as its add_generated_tracks writes. */
const withGeneratedGuitar = (input: MidiData): MidiData =>
  file([
    ...input.tracks,
    part({
      name: 'Generated Acoustic Guitar (nylon)',
      channel: 2,
      program: 24,
      notes: [43, 47, 50],
    }),
  ]);

function fakeSpace(script: SpaceScript = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let uploaded: Uint8Array | null = null;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const fail = (step: keyof NonNullable<SpaceScript['status']>) =>
      script.status?.[step] ? new Response('nope', { status: script.status[step] }) : null;
    if (url === `${HOST}/gradio_api/upload`) {
      const form = init.body as FormData;
      const blob = form.get('files') as File;
      uploaded = new Uint8Array(await blob.arrayBuffer());
      return fail('upload') ?? Response.json(['/tmp/gradio/abc/input.mid']);
    }
    if (url === `${HOST}/gradio_api/call/process`) {
      return fail('queue') ?? Response.json({ event_id: 'evt-1' });
    }
    if (url === `${HOST}/gradio_api/call/process/evt-1`) {
      const sse =
        script.sse ??
        `event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"path": "/tmp/gradio/out/generated_accompaniment.mid", "url": "${HOST}/gradio_api/file=/tmp/gradio/out/generated_accompaniment.mid", "orig_name": "generated_accompaniment.mid", "meta": {"_type": "gradio.FileData"}}]\n\n`;
      return fail('result') ?? new Response(sse);
    }
    if (url.startsWith(`${HOST}/gradio_api/file=`)) {
      const input = parseMidi(uploaded!);
      const output = (script.output ?? withGeneratedGuitar)(input);
      return fail('download') ?? new Response(Uint8Array.from(writeMidi(output)));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    uploadedMidi: () => parseMidi(uploaded!),
    queuedData: () =>
      JSON.parse(String(calls.find((c) => c.url === `${HOST}/gradio_api/call/process`)!.init.body))
        .data as unknown[],
  };
}

const trackNames = (midi: MidiData) =>
  midi.tracks.map((t) => {
    const named = t.find((e) => e.type === 'trackName');
    return named && 'text' in named ? named.text : '';
  });

describe('runMusicInfillService (accompany)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ALLOW_SERVER_LLM_KEYS', 'true');
    vi.stubEnv('MUSIC_AMT_SPACE_ID', 'jhlusko/Anticipatory-Music-Transformer');
    vi.stubEnv('MUSIC_AMT_SPACE_TOKEN', 'hf_test');
    vi.stubEnv('MUSIC_AMT_SPACE_URL', '');
    vi.stubEnv('MUSIC_AMT_MODEL_ID', '');
    vi.stubEnv('MUSIC_AMT_MAX_INPUT_SECONDS', '');
    mocked.createScoreArtifact.mockImplementation(
      async (input: { format: string; filename: string; label: string }) => ({
        id: `artifact-${input.label}`,
        format: input.format,
        filename: input.filename,
      }),
    );
    mocked.convertMusicNotation.mockResolvedValue({
      content: '<score-partwise/>',
      contentEncoding: 'utf8',
      inputFormat: 'midi',
      outputFormat: 'musicxml',
      normalization: { actions: [] },
      validation: { ok: true },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('moves a piano melody off the shared program and returns only the generated parts', async () => {
    const space = fakeSpace();
    const result = await runMusicInfillService({
      mode: 'accompany',
      inputMidiBase64: toBase64(pianoInput()),
      melodyTrackName: 'melody',
      historySeconds: 3,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      engine: 'anticipatory-music-transformer',
      mode: 'accompany',
      model: 'stanford-crfm/music-medium-800k',
      melody: {
        trackIndex: 1,
        trackName: 'Melody',
        program: 73,
        instrument: 'Flute',
        remappedFrom: [0],
      },
      generatedParts: [
        {
          trackName: 'Generated Acoustic Guitar (nylon)',
          instrument: 'Acoustic Guitar (nylon)',
          program: 24,
          channel: 2,
          noteCount: 3,
        },
      ],
      midiArtifactId: 'artifact-amt-output-midi',
      accompanimentMidiArtifactId: 'artifact-amt-generated-parts-midi',
      musicXmlArtifactId: 'artifact-amt-generated-parts-musicxml',
    });
    expect(result.body.inputSeconds).toBeCloseTo(4);
    expect(String((result.body.warnings as string[]).join(' '))).toMatch(/sent as Flute/);

    // The Space is asked for Flute, and the uploaded melody really plays Flute.
    expect(space.queuedData().slice(1)).toEqual(['stanford-crfm/music-medium-800k', 'Flute', 3]);
    expect(space.queuedData()[0]).toMatchObject({
      path: '/tmp/gradio/abc/input.mid',
      orig_name: 'input.mid',
    });
    const melody = space.uploadedMidi().tracks[1];
    expect(
      melody
        .filter((e) => e.type === 'programChange')
        .map((e) => 'programNumber' in e && e.programNumber),
    ).toEqual([73]);
    // The accompaniment keeps piano.
    expect(space.uploadedMidi().tracks[2].find((e) => e.type === 'programChange')).toMatchObject({
      programNumber: 0,
    });

    // Every request carries the token; the upload is named .mid, which the Space requires.
    for (const call of space.calls) {
      expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer hf_test');
    }
    const upload = space.calls[0].init.body as FormData;
    expect((upload.get('files') as File).name).toBe('input.mid');

    // MusicXML is made from the generated parts alone, behind the input's tempo map.
    const convertedB64 = mocked.convertMusicNotation.mock.calls[0][0].content as string;
    const converted = parseMidi(Buffer.from(convertedB64, 'base64'));
    expect(trackNames(converted)).toEqual(['', 'Generated Acoustic Guitar (nylon)']);
    expect(converted.tracks[0].map((e) => e.type)).toEqual([
      'setTempo',
      'timeSignature',
      'endOfTrack',
    ]);
  });

  it('keeps a melody whose program is already unique', async () => {
    const space = fakeSpace();
    const input = file([
      conductor(),
      part({ name: 'Violin', channel: 0, program: 40, notes: SCALE }),
      part({ name: 'Piano', channel: 1, program: 0, notes: [48] }),
    ]);
    const result = await runMusicInfillService({
      inputMidiBase64: toBase64(input),
      model: 'large-800k',
    });

    expect(result.status).toBe(200);
    expect(result.body.melody).toMatchObject({
      trackIndex: 1,
      program: 40,
      instrument: 'Violin',
      remappedFrom: null,
    });
    expect(space.queuedData().slice(1)).toEqual(['stanford-crfm/music-large-800k', 'Violin', 5]);
    expect(space.uploadedMidi().tracks).toEqual(parseMidi(writeMidi(input)).tracks);
  });

  it('reads the input from a MIDI artifact', async () => {
    fakeSpace();
    mocked.getScoreArtifact.mockResolvedValue({
      id: 'in-1',
      format: 'midi',
      encoding: 'base64',
      content: toBase64(pianoInput()),
    });
    const result = await runMusicInfillService({ inputArtifactId: 'in-1', melodyTrack: 1 });
    expect(result.status).toBe(200);
    expect(mocked.getScoreArtifact).toHaveBeenCalledWith('in-1');
  });

  it('exports the live score session to MIDI and accompanies it', async () => {
    const space = fakeSpace();
    mocked.resolveScoreContent.mockResolvedValue({
      xml: '<score-partwise/>',
      artifact: null,
      session: {},
    });
    mocked.convertMusicNotation.mockImplementation(async (request: { outputFormat: string }) =>
      request.outputFormat === 'midi'
        ? { content: toBase64(pianoInput()), contentEncoding: 'base64' }
        : {
            content: '<score-partwise/>',
            contentEncoding: 'utf8',
            inputFormat: 'midi',
            outputFormat: 'musicxml',
            normalization: { actions: [] },
            validation: { ok: true },
          },
    );
    const result = await runMusicInfillService({ scoreSessionId: 'sess-1', melodyTrack: 1 });

    expect(result.status).toBe(200);
    expect(mocked.resolveScoreContent).toHaveBeenCalledWith({ scoreSessionId: 'sess-1' });
    expect(mocked.convertMusicNotation.mock.calls[0][0]).toMatchObject({
      inputFormat: 'musicxml',
      outputFormat: 'midi',
      content: '<score-partwise/>',
    });
    expect(space.queuedData()[2]).toBe('Flute');
  });

  it('passes a missing score session through for the agent to act on', async () => {
    const space = fakeSpace();
    mocked.resolveScoreContent.mockResolvedValue({
      xml: '',
      artifact: null,
      session: null,
      error: { status: 404, body: { error: 'session_not_found' } },
    });
    const result = await runMusicInfillService({ scoreSessionId: 'gone' });
    expect(result).toEqual({ status: 404, body: { error: 'session_not_found' } });
    expect(space.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ mode: 'infill_region', inputMidiBase64: 'x' }, /not available yet/],
    [{ mode: 'remix', inputMidiBase64: 'x' }, /Invalid "mode"/],
    [{ model: 'huge', inputMidiBase64: 'x' }, /Invalid "model"/],
    [{ historySeconds: 30, inputMidiBase64: 'x' }, /historySeconds/],
    [{}, /inputMidiBase64, inputArtifactId/],
    [{ inputMidiBase64: Buffer.from('not midi').toString('base64') }, /not a readable MIDI/],
  ])('rejects %o before calling the Space', async (body, message) => {
    const space = fakeSpace();
    const result = await runMusicInfillService(body);
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(message);
    expect(space.fetchMock).not.toHaveBeenCalled();
  });

  it('names the tracks when the melody track name does not match', async () => {
    fakeSpace();
    const result = await runMusicInfillService({
      inputMidiBase64: toBase64(pianoInput()),
      melodyTrackName: 'Soprano',
    });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/Track names: Melody, Piano/);
  });

  it('refuses input longer than the length limit', async () => {
    vi.stubEnv('MUSIC_AMT_MAX_INPUT_SECONDS', '3');
    const space = fakeSpace();
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/runs 4\.0s; the limit is 3s/);
    expect(space.fetchMock).not.toHaveBeenCalled();
  });

  it('reports a Space input error as 400', async () => {
    fakeSpace({
      sse: 'event: error\ndata: {"error": "No part plays Flute, so there is no melody to accompany."}\n\n',
    });
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/No part plays Flute/);
  });

  it('reports an exhausted GPU quota as 429', async () => {
    fakeSpace({ sse: 'event: error\ndata: {"error": "You have exceeded your GPU quota."}\n\n' });
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(429);
  });

  it('points at the token when the private Space refuses access', async () => {
    fakeSpace({ status: { upload: 401 } });
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(503);
    expect(String(result.body.error)).toMatch(/MUSIC_AMT_SPACE_TOKEN/);
  });

  it('names the flag when a configured token was held back', async () => {
    vi.stubEnv('ALLOW_SERVER_LLM_KEYS', '');
    fakeSpace({ status: { upload: 404 } });
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    const error = String(result.body.error);
    expect(error).toMatch(/No Hugging Face token was sent/);
    expect(error).toMatch(/ALLOW_SERVER_LLM_KEYS=true/);
    expect(error).not.toMatch(/can read the Space/);
  });

  it('leaves out an HTML error page', async () => {
    const space = fakeSpace({ status: { upload: 404 } });
    space.fetchMock.mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html>404</html>', { status: 404 }),
    );
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    const error = String(result.body.error);
    expect(error).toMatch(/can read the Space\.$/);
    expect(error).not.toMatch(/DOCTYPE/);
  });

  it('sends no token unless server credentials are allowed', async () => {
    vi.stubEnv('ALLOW_SERVER_LLM_KEYS', '');
    const space = fakeSpace();
    await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect((space.calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('warns and skips conversion when the model wrote nothing', async () => {
    fakeSpace({ output: (input) => input });
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(200);
    expect(result.body.generatedParts).toEqual([]);
    expect(result.body.accompanimentMidiArtifactId).toBeNull();
    expect(result.body.musicXmlArtifactId).toBeNull();
    expect(result.body.warnings).toContain('The model wrote no new notes.');
    expect(mocked.convertMusicNotation).not.toHaveBeenCalled();
  });

  it('still returns MIDI when MusicXML conversion fails', async () => {
    fakeSpace();
    mocked.convertMusicNotation.mockRejectedValueOnce(new Error('bad midi'));
    const result = await runMusicInfillService({ inputMidiBase64: toBase64(pianoInput()) });
    expect(result.status).toBe(200);
    expect(result.body.accompanimentMidiArtifactId).toBe('artifact-amt-generated-parts-midi');
    expect(result.body.conversionError).toMatchObject({ message: 'bad midi' });
  });
});

describe('AMT helpers', () => {
  it('derives the Space host from its id', () => {
    expect(spaceHostFromId('jhlusko/Anticipatory-Music-Transformer')).toBe(HOST);
    expect(spaceHostFromId('Some_User/my.space')).toBe('https://some-user-my-space.hf.space');
  });

  it('reads the final event from a Gradio SSE body', () => {
    expect(
      parseGradioSse('event: generating\ndata: null\n\nevent: complete\ndata: [1]\n\n'),
    ).toEqual({
      event: 'complete',
      data: [1],
    });
    expect(parseGradioSse('event: error\ndata: null\n\n')).toEqual({ event: 'error', data: null });
    expect(parseGradioSse('event: heartbeat\ndata: null\n\n')).toBeNull();
  });

  it('measures length through tempo changes', () => {
    // 4 beats at 120 bpm (2s), then 4 beats at 60 bpm (4s).
    const midi = file([
      [
        { deltaTime: 0, type: 'setTempo', meta: true, microsecondsPerBeat: 500_000 },
        { deltaTime: 4 * PER_BEAT, type: 'setTempo', meta: true, microsecondsPerBeat: 1_000_000 },
        { deltaTime: 0, type: 'endOfTrack', meta: true },
      ],
      part({ channel: 0, notes: SCALE }),
    ]);
    expect(midiDurationSeconds(midi)).toBeCloseTo(6);
  });
});
