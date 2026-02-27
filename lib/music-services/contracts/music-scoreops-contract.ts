import type { MusicToolContract } from './types';

export const MUSIC_SCOREOPS_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.scoreops',
  description: 'Plan and apply deterministic score operations (ScoreOps MVP) against MusicXML/session state.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      prompt: { type: 'string' },
      scoreSessionId: { type: 'string' },
      baseRevision: { type: 'number', minimum: 0 },
      content: { type: 'string' },
      text: { type: 'string' },
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      options: {
        type: 'object',
        additionalProperties: false,
        properties: {
          atomic: { type: 'boolean' },
          includeXml: { type: 'boolean' },
          includePatch: { type: 'boolean' },
          includeMeasureDiff: { type: 'boolean' },
        },
      },
    },
    required: ['prompt'],
    anyOf: [
      { required: ['prompt', 'scoreSessionId'] },
      { required: ['prompt', 'content'] },
      { required: ['prompt', 'text'] },
      { required: ['prompt', 'inputArtifactId'] },
      { required: ['prompt', 'input_artifact_id'] },
    ],
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'mode', 'planner', 'execution'],
        properties: {
          ok: { type: 'boolean' },
          mode: { type: 'string', enum: ['scoreops-heuristic'] },
          planner: { type: 'object' },
          execution: { type: 'object' },
        },
      },
      {
        type: 'object',
        required: ['ok', 'error'],
        properties: {
          ok: { type: 'boolean', enum: [false] },
          error: { type: 'object' },
          planner: { type: 'object' },
        },
      },
    ],
  },
};
