import type { MusicToolContract } from './types';

export const MUSIC_MMA_RENDER_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.mma_render',
  description: 'Compile an MMA script to MIDI, optionally convert to MusicXML, and return artifact metadata.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['script'],
    properties: {
      script: { type: 'string' },
      content: { type: 'string' },
      text: { type: 'string' },
      filename: { type: 'string' },
      includeMidi: { type: 'boolean' },
      include_midi: { type: 'boolean' },
      includeMusicXml: { type: 'boolean' },
      include_music_xml: { type: 'boolean' },
      persistArtifacts: { type: 'boolean' },
      persist_artifacts: { type: 'boolean' },
      validate: { type: 'boolean' },
      deepValidate: { type: 'boolean' },
      deep_validate: { type: 'boolean' },
      timeoutMs: { type: 'number', minimum: 1 },
      timeout_ms: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'warnings', 'artifacts', 'validation', 'provenance'],
        properties: {
          ok: { type: 'boolean' },
          warnings: {
            type: 'array',
            items: { type: 'string' },
          },
          midiBase64: { type: 'string' },
          musicxml: { type: 'string' },
          artifacts: { type: 'object' },
          validation: { type: 'object' },
          provenance: { type: 'object' },
        },
      },
      {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'object' },
        },
      },
    ],
  },
};
