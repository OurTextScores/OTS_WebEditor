import type { MusicToolContract } from './types';

export const MUSIC_FUNCTIONAL_HARMONY_ANALYZE_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.functional_harmony_analyze',
  description: 'Analyze MusicXML for Roman numerals, local keys, and functional-harmony summaries without modifying the score by default.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      inputArtifactId: { type: 'string' },
      scoreSessionId: { type: 'string' },
      backend: { type: 'string', enum: ['music21-roman'] },
      includeSegments: { type: 'boolean' },
      includeTextExport: { type: 'boolean' },
      includeAnnotatedContent: { type: 'boolean' },
      persistArtifacts: { type: 'boolean' },
      granularity: { type: 'string', enum: ['auto', 'measure'] },
      preferLocalKey: { type: 'boolean' },
      detectCadences: { type: 'boolean' },
      detectModulations: { type: 'boolean' },
      timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000 },
    },
    additionalProperties: true,
  },
  outputSchema: {
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'engine', 'analysis', 'warnings'],
        properties: {
          ok: { type: 'boolean', const: true },
          engine: { type: 'string' },
          analysis: { type: 'object' },
          warnings: { type: 'array', items: { type: 'string' } },
          segments: { type: 'array', items: { type: 'object' } },
          keys: { type: 'array', items: { type: 'object' } },
          cadences: { type: 'array', items: { type: 'object' } },
          exports: {
            type: 'object',
            properties: {
              json: { type: 'string' },
              rntxt: { type: 'string' },
            },
            additionalProperties: true,
          },
          annotatedXml: { type: 'string' },
          artifacts: { type: 'object' },
        },
      },
      {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { type: 'boolean', const: false },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
      },
    ],
  },
};
