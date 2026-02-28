import type { MusicToolContract } from './types';

export const MUSIC_CONVERT_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.convert',
  description: 'Convert between MusicXML and ABC, with artifact creation and validation metadata.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      healthCheck: { type: 'boolean' },
      health_check: { type: 'boolean' },
      inputFormat: { type: 'string', enum: ['abc', 'musicxml', 'xml'] },
      input_format: { type: 'string', enum: ['abc', 'musicxml', 'xml'] },
      outputFormat: { type: 'string', enum: ['abc', 'musicxml', 'xml'] },
      output_format: { type: 'string', enum: ['abc', 'musicxml', 'xml'] },
      content: { type: 'string' },
      text: { type: 'string' },
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      filename: { type: 'string' },
      validate: { type: 'boolean' },
      deepValidate: { type: 'boolean' },
      deep_validate: { type: 'boolean' },
      includeContent: { type: 'boolean' },
      include_content: { type: 'boolean' },
      timeoutMs: { type: 'number', minimum: 1 },
      timeout_ms: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'engine', 'scripts', 'pythonCommand', 'missing'],
        properties: {
          ok: { type: 'boolean' },
          engine: { type: 'string' },
          scripts: {
            type: 'object',
            required: ['xml2abc', 'abc2xml'],
            properties: {
              xml2abc: { type: 'string' },
              abc2xml: { type: 'string' },
            },
          },
          pythonCommand: { type: 'string' },
          missing: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      {
        type: 'object',
        required: ['inputArtifactId', 'outputArtifactId', 'conversion'],
        properties: {
          inputArtifactId: { type: 'string' },
          outputArtifactId: { type: 'string' },
          inputArtifact: { type: 'object' },
          outputArtifact: { type: 'object' },
          conversion: { type: 'object' },
          content: { type: 'string' },
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

