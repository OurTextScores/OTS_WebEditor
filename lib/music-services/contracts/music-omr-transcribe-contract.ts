import type { MusicToolContract } from './types';

export const MUSIC_OMR_TRANSCRIBE_TOOL_CONTRACT: MusicToolContract = {
  name: 'music.omr_transcribe',
  description:
    'Transcribe a rendered score page image with Transcoda, returning **kern and optionally converted MusicXML artifacts.',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['imageBase64'],
    properties: {
      imageBase64: { type: 'string' },
      image_base64: { type: 'string' },
      imageDataUrl: { type: 'string' },
      image_data_url: { type: 'string' },
      mimeType: { type: 'string', default: 'image/png' },
      mime_type: { type: 'string', default: 'image/png' },
      pageNumber: { type: 'number', minimum: 1 },
      page_number: { type: 'number', minimum: 1 },
      spaceId: { type: 'string' },
      space_id: { type: 'string' },
      decoding: { type: 'string', enum: ['greedy', 'beam'], default: 'greedy' },
      maxLength: { type: 'number', minimum: 1, default: 2048 },
      max_length: { type: 'number', minimum: 1, default: 2048 },
      numBeams: { type: 'number', minimum: 1, default: 3 },
      num_beams: { type: 'number', minimum: 1, default: 3 },
      repetitionPenalty: { type: 'number', minimum: 0, default: 1.1 },
      repetition_penalty: { type: 'number', minimum: 0, default: 1.1 },
      convertToMusicXml: { type: 'boolean', default: true },
      convert_to_musicxml: { type: 'boolean', default: true },
      deepValidate: { type: 'boolean', default: false },
      deep_validate: { type: 'boolean', default: false },
      includeContent: { type: 'boolean', default: false },
      include_content: { type: 'boolean', default: false },
      timeoutMs: { type: 'number', minimum: 1 },
      timeout_ms: { type: 'number', minimum: 1 },
    },
  },
  outputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        required: ['ok', 'engine', 'inputArtifactId', 'kernArtifactId'],
        properties: {
          ok: { type: 'boolean' },
          engine: { type: 'string' },
          provider: { type: 'string' },
          spaceId: { type: 'string' },
          inputArtifactId: { type: 'string' },
          kernArtifactId: { type: 'string' },
          musicXmlArtifactId: { type: ['string', 'null'] },
          content: { type: 'object' },
          conversion: { type: ['object', 'null'] },
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
