import type { MusicToolContract } from './types';

export const MUSIC_HARMONY_ANALYZE_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.harmony_analyze',
  description: 'Analyze MusicXML harmony, optionally insert <harmony> tags, and return tagged MusicXML plus analysis metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      inputArtifactId: { type: 'string' },
      scoreSessionId: { type: 'string' },
      insertHarmony: { type: 'boolean' },
      includeContent: { type: 'boolean' },
      persistArtifacts: { type: 'boolean' },
      harmonicRhythm: { type: 'string', enum: ['auto', 'measure', 'beat'] },
      maxChangesPerMeasure: { type: 'integer', minimum: 1, maximum: 8 },
      preferLocalKey: { type: 'boolean' },
      includeRomanNumerals: { type: 'boolean' },
      simplifyForMma: { type: 'boolean' },
      existingHarmonyMode: { type: 'string', enum: ['preserve', 'replace', 'fill-missing'] },
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
          engine: { type: 'string', const: 'music21' },
          analysis: { type: 'object' },
          warnings: { type: 'array', items: { type: 'string' } },
          content: {
            type: 'object',
            properties: {
              musicxml: { type: 'string' },
            },
            additionalProperties: true,
          },
          segments: { type: 'array', items: { type: 'object' } },
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
