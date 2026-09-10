import type { MusicToolContract } from './types';

export const MUSIC_MULTITRACK_VAE_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.multitrack_vae',
  description:
    'Generate, interpolate, or reconstruct short multitrack (up to 8-track) General MIDI measures with Magenta Multitrack MusicVAE (via a Hugging Face Gradio Space), optionally chord-conditioned; converts the result to MusicXML.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['mode'],
    properties: {
      mode: {
        type: 'string',
        enum: [
          'sample',
          'chord_progression',
          'style_interpolation',
          'reconstruct',
          'encode_interpolation',
        ],
      },
      model: { type: 'string', enum: ['chords', 'unconditioned'] },
      chord: { type: 'string' },
      chords: { type: 'array', items: { type: 'string' } },
      chordProgression: { type: 'array', items: { type: 'string' } },
      temperature: { type: 'number', minimum: 0.01, maximum: 1.5, default: 0.2 },
      numBars: { type: 'number', minimum: 4, maximum: 64, default: 32 },
      num_bars: { type: 'number', minimum: 4, maximum: 64 },
      numSamples: { type: 'number', minimum: 1, maximum: 8, default: 4 },
      num_samples: { type: 'number', minimum: 1, maximum: 8 },
      seed: { type: 'number' },
      index: { type: 'number', minimum: 0 },
      index1: { type: 'number', minimum: 0 },
      index2: { type: 'number', minimum: 0 },
      inputArtifactId: { type: 'string' },
      inputMidiBase64: { type: 'string' },
      input_midi_base64: { type: 'string' },
      convertToMusicXml: { type: 'boolean', default: true },
      convert_to_musicxml: { type: 'boolean', default: true },
      includeContent: { type: 'boolean', default: false },
      include_content: { type: 'boolean', default: false },
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
          checkpoint: { type: 'string' },
          numMeasures: { type: 'number' },
          midiArtifactId: { type: 'string' },
          musicXmlArtifactId: { type: ['string', 'null'] },
          metadata: { type: 'object' },
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
