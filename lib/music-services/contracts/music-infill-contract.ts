import type { MusicToolContract } from './types';

export const MUSIC_INFILL_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.infill',
  description:
    'Write an accompaniment under a melody with the Anticipatory Music Transformer (via a Hugging Face Space): holds the chosen melody part of a MIDI passage (or the open score session) fixed and generates new parts, returned as their own MIDI and MusicXML to add to the score. Only mode "accompany" is available; region and instrument infill are planned.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['accompany'], default: 'accompany' },
      inputArtifactId: { type: 'string' },
      inputMidiBase64: { type: 'string' },
      scoreSessionId: { type: 'string' },
      melodyTrack: { type: 'number', minimum: 0 },
      melodyTrackName: { type: 'string' },
      historySeconds: { type: 'number', minimum: 1, maximum: 10, default: 5 },
      model: {
        type: 'string',
        enum: ['small-800k', 'medium-800k', 'large-800k'],
        default: 'medium-800k',
      },
      convertToMusicXml: { type: 'boolean', default: true },
      includeContent: { type: 'boolean', default: false },
      timeoutMs: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'engine', 'mode', 'midiArtifactId'],
        properties: {
          ok: { type: 'boolean' },
          provider: { type: 'string' },
          engine: { type: 'string' },
          mode: { type: 'string' },
          model: { type: 'string' },
          spaceId: { type: 'string' },
          melody: { type: 'object' },
          inputSeconds: { type: 'number' },
          generatedParts: { type: 'array', items: { type: 'object' } },
          midiArtifactId: { type: 'string' },
          accompanimentMidiArtifactId: { type: ['string', 'null'] },
          musicXmlArtifactId: { type: ['string', 'null'] },
          warnings: { type: 'array', items: { type: 'string' } },
          conversion: { type: ['object', 'null'] },
        },
      },
      {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string' },
        },
      },
    ],
  },
};
