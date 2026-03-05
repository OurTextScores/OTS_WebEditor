import type { MusicToolContract } from './types';

export const MUSIC_CHORDGAN_OPTIONS_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.chordgan_options',
  description: 'Return ChordGAN backend/style options metadata for UI setup and dry-run planning.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      backend: { type: 'string', enum: ['huggingface-space', 'hf-space', 'space', 'gradio-space'] },
      spaceId: { type: 'string' },
      space_id: { type: 'string' },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'specialist', 'backend', 'options'],
        properties: {
          ok: { type: 'boolean' },
          specialist: { type: 'string', enum: ['chordgan'] },
          backend: { type: 'string' },
          phase: { type: 'string' },
          options: { type: 'object' },
          capabilities: { type: 'object' },
          message: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { type: 'boolean' },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    ],
  },
};

