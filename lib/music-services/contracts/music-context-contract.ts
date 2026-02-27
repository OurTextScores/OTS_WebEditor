import type { MusicToolContract } from './types';

export const MUSIC_CONTEXT_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.context',
  description: 'Extract bounded MusicXML context snippets (selection/range/search) for reasoning models.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      inputArtifactId: { type: 'string' },
      input_artifact_id: { type: 'string' },
      content: { type: 'string' },
      text: { type: 'string' },
      filename: { type: 'string' },
      persistArtifact: { type: 'boolean' },
      persist_artifact: { type: 'boolean' },
      includeFullXml: { type: 'boolean' },
      include_full_xml: { type: 'boolean' },
      includePartList: { type: 'boolean' },
      include_part_list: { type: 'boolean' },
      includeMeasureRange: { type: 'boolean' },
      include_measure_range: { type: 'boolean' },
      includeSearchHits: { type: 'boolean' },
      include_search_hits: { type: 'boolean' },
      maxChars: { type: 'number', minimum: 1 },
      max_chars: { type: 'number', minimum: 1 },
      maxMeasures: { type: 'number', minimum: 1 },
      max_measures: { type: 'number', minimum: 1 },
      maxSearchResults: { type: 'number', minimum: 1 },
      max_search_results: { type: 'number', minimum: 1 },
      snippetChars: { type: 'number', minimum: 1 },
      snippet_chars: { type: 'number', minimum: 1 },
      maxMeasureXmlChars: { type: 'number', minimum: 1 },
      max_measure_xml_chars: { type: 'number', minimum: 1 },
      measureStart: { type: 'number', minimum: 0 },
      measure_start: { type: 'number', minimum: 0 },
      measureEnd: { type: 'number', minimum: 0 },
      measure_end: { type: 'number', minimum: 0 },
      query: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      queries: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    anyOf: [
      { required: ['inputArtifactId'] },
      { required: ['input_artifact_id'] },
      { required: ['content'] },
      { required: ['text'] },
    ],
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['strategy', 'context'],
        properties: {
          strategy: { type: 'string', enum: ['musicxml-primary'] },
          inputArtifactId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          inputArtifact: { anyOf: [{ type: 'object' }, { type: 'null' }] },
          context: { type: 'object' },
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

