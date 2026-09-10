import type { MusicToolContract } from './types';

export const MUSIC_DIFF_FEEDBACK_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.diff_feedback',
  description:
    'Iteratively revise an assistant proposal by sending per-block diff feedback and returning a refined musicxml-patch@1 plus proposed MusicXML.',
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
      temperature: { type: 'number' },
      editEffort: { type: 'string', enum: ['efficient', 'balanced', 'thorough'] },
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
      userEdits: {
        type: 'array',
        maxItems: 2,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['side', 'label', 'diff'],
          properties: {
            side: { type: 'string', enum: ['current', 'proposal'] },
            label: { type: 'string', minLength: 1, maxLength: 128 },
            diff: { type: 'string', minLength: 1, maxLength: 24000 },
          },
        },
      },
      proposalSession: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'cycle'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 64 },
          cycle: { type: 'number', minimum: 1 },
          originalInstruction: { type: 'string' },
          previousCycle: {
            type: 'object',
            additionalProperties: false,
            required: ['cycle', 'baseContentHash', 'proposedContentHash'],
            properties: {
              cycle: { type: 'number', minimum: 1 },
              baseContentHash: { type: 'string' },
              baseIdentityHash: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              proposedContentHash: { type: 'string' },
              proposedIdentityHash: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              expectedCurrentContentHash: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              expectedCurrentIdentityHash: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              continuityToken: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              patch: { anyOf: [{ type: 'object' }, { type: 'null' }] },
              annotations: { type: 'array', items: { type: 'object' } },
            },
          },
          constraints: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['cycle', 'kind'],
              properties: {
                cycle: { type: 'number', minimum: 1 },
                kind: { type: 'string', enum: ['rejected', 'note'] },
                partIndex: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                measureRange: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                text: { type: 'string' },
              },
            },
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
          annotations: { type: 'array', items: { type: 'object' } },
          proposedXml: { type: 'string' },
          proposal: { type: 'object' },
          proposalSessionId: { type: 'string' },
          cycle: { type: 'number' },
          continuityToken: { type: 'string' },
          audit: { type: 'object' },
          failures: { type: 'array', items: { type: 'object' } },
          verification: { type: 'object' },
          feedbackPrompt: { type: 'string' },
          model: { type: 'string' },
          provider: { type: 'string' },
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
