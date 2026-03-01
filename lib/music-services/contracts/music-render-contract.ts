import type { MusicToolContract } from './types';

export const MUSIC_RENDER_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.render',
  description: 'Generate a visual snapshot (PNG or PDF) of the MusicXML score for visual analysis.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      content: { type: 'string' },
      text: { type: 'string' },
      format: { type: 'string', enum: ['png', 'pdf'], default: 'png' },
      dpi: { type: 'number', minimum: 72, maximum: 600, default: 150 },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['format', 'mimeType', 'dataUrl'],
        properties: {
          format: { type: 'string', enum: ['png', 'pdf'] },
          mimeType: { type: 'string' },
          dataUrl: { type: 'string' },
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
