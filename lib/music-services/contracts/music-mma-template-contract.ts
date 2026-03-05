import type { MusicToolContract } from './types';

export const MUSIC_MMA_TEMPLATE_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.mma_template',
  description: 'Generate an MMA starter script from MusicXML score context (meter, key, tempo, and harmony hints).',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      scoreSessionId: { type: 'string' },
      score_session_id: { type: 'string' },
      baseRevision: { type: 'number', minimum: 0 },
      base_revision: { type: 'number', minimum: 0 },
      content: { type: 'string' },
      text: { type: 'string' },
      maxMeasures: { type: 'number', minimum: 1, maximum: 2500 },
      max_measures: { type: 'number', minimum: 1, maximum: 2500 },
      defaultGroove: { type: 'string' },
      default_groove: { type: 'string' },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['template', 'analysis', 'warnings'],
        properties: {
          template: { type: 'string' },
          analysis: {
            type: 'object',
            properties: {
              meter: { type: 'string' },
              key: { type: 'string' },
              tempo: { type: 'number' },
              measureCount: { type: 'number' },
              harmonyMeasureCount: { type: 'number' },
              harmonyCoverage: { type: 'number' },
            },
          },
          warnings: {
            type: 'array',
            items: { type: 'string' },
          },
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
