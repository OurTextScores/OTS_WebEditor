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
      ops: {
        type: 'array',
        description: 'Structured ScoreOps operations. When provided, bypasses prompt parsing.',
        items: {
          type: 'object',
          properties: {
            op: {
              type: 'string',
              enum: [
                'set_key_signature', 'set_time_signature', 'set_clef',
                'set_metadata_text', 'transpose_selection',
                'insert_measures', 'remove_measures',
                'delete_selection', 'delete_text_by_content',
                'add_tempo_marking', 'add_dynamic',
                'select_measure_range', 'select_all',
                'replace_selected_text', 'set_duration', 'set_voice',
                'set_accidental', 'insert_text',
                'set_layout_break', 'set_repeat_markers', 'history_step',
              ],
            },
          },
          required: ['op'],
        },
      },
      options: {
        type: 'object',
        additionalProperties: false,
        properties: {
          atomic: { type: 'boolean' },
          includeXml: { type: 'boolean' },
          includePatch: { type: 'boolean' },
          includeMeasureDiff: { type: 'boolean' },
          preferredExecutor: { type: 'string', enum: ['auto', 'wasm', 'xml'] },
        },
      },
    },
    anyOf: [
      { required: ['prompt', 'scoreSessionId'] },
      { required: ['prompt', 'content'] },
      { required: ['prompt', 'text'] },
      { required: ['prompt', 'inputArtifactId'] },
      { required: ['prompt', 'input_artifact_id'] },
      { required: ['ops', 'content'] },
      { required: ['ops', 'scoreSessionId'] },
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
