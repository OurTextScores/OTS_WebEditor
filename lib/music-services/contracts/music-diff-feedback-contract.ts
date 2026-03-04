import type { MusicToolContract } from './types';

export const MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.diff_feedback',
  description: 'Iteratively revise an assistant proposal by sending per-block diff feedback and returning a refined musicxml-patch@1 plus proposed MusicXML.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['scoreSessionId', 'baseRevision', 'blocks'],
    properties: {
      scoreSessionId: { type: 'string', minLength: 1 },
      baseRevision: { type: 'number' },
      provider: { type: 'string' },
      model: { type: 'string' },
      apiKey: { type: 'string' },
      api_key: { type: 'string' },
      maxTokens: { type: 'number', minimum: 1 },
      max_tokens: { type: 'number', minimum: 1 },
      iteration: { type: 'number', minimum: 0 },
      globalComment: { type: 'string' },
      chatHistory: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'text'],
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            text: { type: 'string' },
          },
        },
      },
      blocks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['partIndex', 'measureRange', 'status'],
          properties: {
            partIndex: { type: 'number', minimum: 0 },
            measureRange: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['accepted', 'rejected', 'comment', 'pending'] },
            comment: { type: 'string' },
          },
        },
      },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['scoreSessionId', 'iteration', 'patch', 'proposedXml'],
        properties: {
          scoreSessionId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          baseRevision: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          iteration: { type: 'number' },
          patch: { type: 'object' },
          proposedXml: { type: 'string' },
          feedbackPrompt: { type: 'string' },
          model: { type: 'string' },
          provider: { type: 'string' },
          retried: { type: 'boolean' },
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
