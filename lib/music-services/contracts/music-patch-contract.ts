import type { MusicToolContract } from './types';

export const MUSIC_PATCH_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.patch',
  description: 'Generate a musicxml-patch@1 payload from edit instructions and current MusicXML.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      prompt: { type: 'string' },
      content: { type: 'string' },
      text: { type: 'string' },
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      apiKey: { type: 'string' },
      api_key: { type: 'string' },
      model: { type: 'string' },
      maxTokens: { type: 'number', minimum: 1 },
      max_tokens: { type: 'number', minimum: 1 },
      dryRun: { type: 'boolean' },
      dry_run: { type: 'boolean' },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['mode', 'model', 'patch'],
        properties: {
          mode: { type: 'string', enum: ['openai-responses'] },
          model: { type: 'string' },
          inputArtifactId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          patch: { type: 'object' },
          text: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['ready', 'message'],
        properties: {
          ready: { type: 'boolean' },
          message: { type: 'string' },
          request: { type: 'object' },
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

