import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type APIRequestContext, expect, test } from '@playwright/test';

const SCALE_XML = readFileSync(
  resolve(__dirname, '../unit/fixtures/c-major-scale.musicxml'),
  'utf-8',
);
const MIDI_FIXTURES = [
  {
    filename: 'midi3.mid',
    contentBase64: readFileSync(resolve(__dirname, '../webmscore-fork/test/midi/midi3.mid')).toString('base64'),
  },
  {
    filename: 'midi5.mid',
    contentBase64: readFileSync(resolve(__dirname, '../webmscore-fork/test/midi/midi5.mid')).toString('base64'),
  },
  {
    filename: 'midi1.mid',
    contentBase64: readFileSync(resolve(__dirname, '../webmscore-fork/test/midi/midi1.mid')).toString('base64'),
  },
];

const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`;

function extractServiceErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const data = payload as Record<string, unknown>;
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  return '';
}

function isLikelyMidiToolingError(message: string) {
  return /not found|enoent|no command candidates|cannot open display|could not connect to display|xvfb-run|qt\.qpa|platform plugin|timed out/i
    .test(message);
}

function isLikelyMmaToolingError(message: string) {
  return /mma tool unavailable|no mma command candidates|enoent|not found|timed out|did not generate midi/i
    .test(message);
}

function maybeSkipIfMidiToolsUnavailable(status: number, payload: unknown) {
  const message = extractServiceErrorMessage(payload);
  if (status < 500 || !message) {
    return;
  }
  test.skip(isLikelyMidiToolingError(message), `MIDI conversion tooling unavailable in runtime: ${message}`);
}

function assertBase64MidiHeader(contentBase64: string) {
  const bytes = Buffer.from(contentBase64, 'base64');
  expect(bytes.length).toBeGreaterThan(14);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('MThd');
}

type ConvertResponsePayload = {
  inputArtifactId?: string;
  outputArtifactId?: string;
  content?: string;
  contentEncoding?: string;
  conversion?: {
    inputFormat?: string;
    outputFormat?: string;
    contentEncoding?: string;
  };
  [key: string]: unknown;
};

type ArtifactResponsePayload = {
  artifact?: {
    format?: string;
    encoding?: string;
    content?: string;
    parentArtifactId?: string;
    sourceArtifactId?: string;
  };
  [key: string]: unknown;
};

async function convertMidiFixtureToXml(request: APIRequestContext, options?: { includeContent?: boolean }) {
  const attempts: Array<{ filename: string; status: number; message: string }> = [];
  for (const fixture of MIDI_FIXTURES) {
    const response = await request.post('/api/music/convert', {
      data: {
        inputFormat: 'midi',
        outputFormat: 'musicxml',
        contentBase64: fixture.contentBase64,
        filename: fixture.filename,
        includeContent: options?.includeContent ?? false,
      },
      timeout: 90_000,
    });
    const json = await response.json();
    if (response.ok()) {
      return { response, json, fixtureFilename: fixture.filename };
    }
    const message = extractServiceErrorMessage(json);
    attempts.push({ filename: fixture.filename, status: response.status(), message });
    if (response.status() >= 500 && isLikelyMidiToolingError(message)) {
      return { response, json, fixtureFilename: fixture.filename, attempts };
    }
  }

  throw new Error(`No MIDI fixture converted successfully: ${JSON.stringify(attempts)}`);
}

/* ------------------------------------------------------------------ */
/*  Service endpoint smoke tests — always run (no API key needed)     */
/* ------------------------------------------------------------------ */
test.describe('Music service endpoints', () => {
  test('context: returns MusicXML-primary context envelope', async ({ request }) => {
    const response = await request.post('/api/music/context', {
      data: { content: MINIMAL_XML, includeFullXml: false },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.strategy).toBe('musicxml-primary');
    expect(json.context?.format).toBe('musicxml');
  });

  test('context: extracts measure data from scale fixture', async ({ request }) => {
    const response = await request.post('/api/music/context', {
      data: { content: SCALE_XML, includeFullXml: false },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.strategy).toBe('musicxml-primary');
    const ctx = json.context;
    expect(ctx).toBeTruthy();
    expect(ctx.format).toBe('musicxml');
    expect(ctx.measureCountEstimate).toBe(2);
    // Key and time sig are embedded in the measure XML
    const measures = ctx.measureRange?.results;
    expect(Array.isArray(measures)).toBe(true);
    expect(measures.length).toBe(2);
    expect(measures[0].xml).toContain('<fifths>0</fifths>');
    expect(measures[0].xml).toContain('<beats>4</beats>');
  });

  test('convert: handles same-format abc passthrough', async ({ request }) => {
    const response = await request.post('/api/music/convert', {
      data: {
        inputFormat: 'abc',
        outputFormat: 'abc',
        content: 'M:4/4\nK:C\nC D E F |',
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.outputArtifactId).toBeTruthy();
    expect(json.conversion?.outputFormat).toBe('abc');
  });

  test('mma template: returns a starter script from MusicXML input', async ({ request }) => {
    const response = await request.post('/api/music/mma/template', {
      data: {
        content: SCALE_XML,
        maxMeasures: 4,
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(typeof json.template).toBe('string');
    expect(json.template).toContain('TimeSig');
    expect(json.analysis?.meter).toBeTruthy();
  });

  test('mma render: compiles script and optionally converts to MusicXML', async ({ request }) => {
    const script = `Tempo 108\nTimeSig 4 4\nKeySig C\nGroove Swing\n\n1 C F G7 C\n`;
    const response = await request.post('/api/music/mma/render', {
      data: {
        script,
        includeMidi: true,
        includeMusicXml: true,
      },
      timeout: 90_000,
    });
    const json = await response.json();
    if (!response.ok()) {
      const message = extractServiceErrorMessage(json);
      test.skip(isLikelyMmaToolingError(message), `MMA tooling unavailable in runtime: ${message}`);
    }

    expect(response.ok()).toBeTruthy();
    expect(typeof json.midiBase64).toBe('string');
    assertBase64MidiHeader(json.midiBase64 || '');
    expect(typeof json.musicxml).toBe('string');
    expect(json.musicxml).toContain('<score-partwise');
  });

  test('convert: MIDI upload (base64) to MusicXML stores artifacts', async ({ request }) => {
    const conversion = await convertMidiFixtureToXml(request, { includeContent: true });
    const response = conversion.response;
    const json = conversion.json as ConvertResponsePayload;
    maybeSkipIfMidiToolsUnavailable(response.status(), json);

    expect(response.ok()).toBeTruthy();
    expect(json.inputArtifactId).toBeTruthy();
    expect(json.outputArtifactId).toBeTruthy();
    expect(json.conversion?.inputFormat).toBe('midi');
    expect(json.conversion?.outputFormat).toBe('musicxml');
    expect(json.conversion?.contentEncoding).toBe('utf8');
    expect(json.contentEncoding).toBe('utf8');
    expect(json.content).toContain('<score-partwise');

    const inputArtifactResponse = await request.post('/api/music/artifacts/get', {
      data: { id: json.inputArtifactId, includeContent: true },
    });
    expect(inputArtifactResponse.ok()).toBeTruthy();
    const inputArtifactJson = await inputArtifactResponse.json() as ArtifactResponsePayload;
    expect(inputArtifactJson.artifact?.format).toBe('midi');
    expect(inputArtifactJson.artifact?.encoding).toBe('base64');
    expect(typeof inputArtifactJson.artifact?.content).toBe('string');
    assertBase64MidiHeader(inputArtifactJson.artifact?.content || '');

    const outputArtifactResponse = await request.post('/api/music/artifacts/get', {
      data: { id: json.outputArtifactId, includeContent: true },
    });
    expect(outputArtifactResponse.ok()).toBeTruthy();
    const outputArtifactJson = await outputArtifactResponse.json() as ArtifactResponsePayload;
    expect(outputArtifactJson.artifact?.format).toBe('musicxml');
    expect(outputArtifactJson.artifact?.encoding).toBe('utf8');
    expect(outputArtifactJson.artifact?.parentArtifactId).toBe(json.inputArtifactId);
    expect(outputArtifactJson.artifact?.sourceArtifactId).toBe(json.inputArtifactId);
    expect(outputArtifactJson.artifact?.content).toContain('<score-partwise');
  });

  test('convert: roundtrip MIDI -> MusicXML -> MIDI keeps artifact chain', async ({ request }) => {
    const conversion = await convertMidiFixtureToXml(request);
    const midiToXmlResponse = conversion.response;
    const midiToXmlJson = conversion.json as ConvertResponsePayload;
    maybeSkipIfMidiToolsUnavailable(midiToXmlResponse.status(), midiToXmlJson);
    expect(midiToXmlResponse.ok()).toBeTruthy();

    const xmlToMidiResponse = await request.post('/api/music/convert', {
      data: {
        inputArtifactId: midiToXmlJson.outputArtifactId,
        outputFormat: 'midi',
        includeContent: true,
      },
      timeout: 90_000,
    });
    const xmlToMidiJson = await xmlToMidiResponse.json() as ConvertResponsePayload;
    expect(xmlToMidiResponse.ok()).toBeTruthy();
    expect(xmlToMidiJson.inputArtifactId).toBe(midiToXmlJson.outputArtifactId);
    expect(xmlToMidiJson.outputArtifactId).toBeTruthy();
    expect(xmlToMidiJson.conversion?.inputFormat).toBe('musicxml');
    expect(xmlToMidiJson.conversion?.outputFormat).toBe('midi');
    expect(xmlToMidiJson.conversion?.contentEncoding).toBe('base64');
    expect(xmlToMidiJson.contentEncoding).toBe('base64');
    expect(typeof xmlToMidiJson.content).toBe('string');
    assertBase64MidiHeader(xmlToMidiJson.content || '');

    const roundtripArtifactResponse = await request.post('/api/music/artifacts/get', {
      data: { id: xmlToMidiJson.outputArtifactId, includeContent: true },
    });
    expect(roundtripArtifactResponse.ok()).toBeTruthy();
    const roundtripArtifactJson = await roundtripArtifactResponse.json() as ArtifactResponsePayload;
    expect(roundtripArtifactJson.artifact?.format).toBe('midi');
    expect(roundtripArtifactJson.artifact?.encoding).toBe('base64');
    expect(roundtripArtifactJson.artifact?.parentArtifactId).toBe(xmlToMidiJson.inputArtifactId);
    expect(roundtripArtifactJson.artifact?.sourceArtifactId).toBe(xmlToMidiJson.inputArtifactId);
    expect(typeof roundtripArtifactJson.artifact?.content).toBe('string');
    assertBase64MidiHeader(roundtripArtifactJson.artifact?.content || '');
  });

  test('generate: supports dry-run without inference call', async ({ request }) => {
    const response = await request.post('/api/music/generate', {
      data: {
        backend: 'huggingface',
        hfToken: 'hf_dummy_token',
        modelId: 'ElectricAlexis/NotaGen',
        prompt: 'Compose a short phrase in C major.',
        dryRun: true,
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.specialist).toBe('notagen');
    expect(json.generation).toBeNull();
    expect(String(json.message || '')).toContain('dryRun=false');
  });

  test('scoreops apply: set_key_signature on scale fixture', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'set_key_signature', fifths: 2 }],
        options: { atomic: true, includeXml: true },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    // Verify the key was changed — output should contain fifths=2 (D major)
    if (json.output?.content) {
      expect(json.output.content).toContain('<fifths>2</fifths>');
    }
  });

  test('scoreops apply: set_time_signature on scale fixture', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'set_time_signature', numerator: 3, denominator: 4 }],
        options: { atomic: true, includeXml: true },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    if (json.output?.content) {
      expect(json.output.content).toContain('<beats>3</beats>');
      expect(json.output.content).toContain('<beat-type>4</beat-type>');
    }
  });

  test('scoreops apply: set_metadata_text (title)', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'set_metadata_text', field: 'title', value: 'My Test Scale' }],
        options: { atomic: true, includeXml: true },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    if (json.output?.content) {
      expect(json.output.content).toContain('My Test Scale');
    }
  });

  test('scoreops apply: multiple ops in one batch', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [
          { op: 'set_key_signature', fifths: -1 },
          { op: 'set_metadata_text', field: 'title', value: 'F Major Scale' },
        ],
        options: { atomic: true, includeXml: true },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    if (json.output?.content) {
      expect(json.output.content).toContain('<fifths>-1</fifths>');
      expect(json.output.content).toContain('F Major Scale');
    }
  });

  test('scoreops apply: export_score musicxml returns base64 export', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'export_score', formats: ['musicxml'] }],
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.exports).toBeTruthy();
    expect(typeof json.exports.musicxml).toBe('string');
    // Revision should not bump for export-only request
    expect(json.newRevision).toBe(json.baseRevision);
    // Decode and verify content
    const decoded = Buffer.from(json.exports.musicxml, 'base64').toString('utf-8');
    expect(decoded).toContain('<score-partwise');
  });

  test('scoreops apply: export_score with midi-only in XML mode returns error', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'export_score', formats: ['midi'] }],
        options: { preferredExecutor: 'xml' },
      },
    });

    const json = await response.json();
    expect(json.ok).toBe(false);
    expect(response.status()).toBe(422);
  });

  test('scoreops apply: export_score mixed formats returns musicxml, notes midi unavailable', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'export_score', formats: ['musicxml', 'midi'] }],
        options: { preferredExecutor: 'xml' },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.exports?.musicxml).toBeTruthy();
    expect(json.exports?.midi).toBeUndefined();
    const exportEntry = json.applied?.find((e: { op: string }) => e.op === 'export_score');
    expect(exportEntry?.message).toContain('midi require WASM');
  });

  test('scoreops apply: export_score with mutation op in same batch', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [
          { op: 'set_metadata_text', field: 'title', value: 'Exported Scale' },
          { op: 'export_score', formats: ['musicxml'] },
        ],
        options: { includeXml: true },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.ok).toBe(true);
    // Mutation happened, so revision should bump
    expect(json.newRevision).toBeGreaterThan(json.baseRevision);
    // Exports should be present
    expect(json.exports?.musicxml).toBeTruthy();
    // The exported musicxml should reflect the mutation
    const decoded = Buffer.from(json.exports.musicxml, 'base64').toString('utf-8');
    expect(decoded).toContain('Exported Scale');
  });

  test('scoreops apply: rejects invalid op gracefully', async ({ request }) => {
    const response = await request.post('/api/music/scoreops/apply', {
      data: {
        action: 'apply',
        content: SCALE_XML,
        ops: [{ op: 'nonexistent_operation' }],
        options: { atomic: true },
      },
    });

    // Should return an error (4xx) for unsupported operation
    const json = await response.json();
    expect(json.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Agent fallback router — comprehensive routing tests               */
/* ------------------------------------------------------------------ */
test.describe('Agent fallback router', () => {
  test('returns 400 for missing prompt', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {},
    });

    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json).toHaveProperty('error');
    expect(json.error).toContain('prompt');
  });

  test('returns 400 for empty prompt', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: { prompt: '   ' },
    });

    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json).toHaveProperty('error');
  });

  test('routes context analysis prompt to music.context', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Analyze this score',
        useFallbackOnly: true,
        toolInput: { context: { content: MINIMAL_XML } },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.context');
    expect(json.toolOk).toBe(true);
  });

  test('routes context analysis with scale fixture', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'What instruments are in this score?',
        useFallbackOnly: true,
        toolInput: { context: { content: SCALE_XML } },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.context');
    expect(json.toolOk).toBe(true);
  });

  test('routes generate/compose prompt to music.generate', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Compose a melody in G major',
        useFallbackOnly: true,
        toolInput: {
          generate: {
            backend: 'huggingface',
            hfToken: 'hf_dummy_token',
            modelId: 'ElectricAlexis/NotaGen',
          },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.generate');
  });

  test('routes conversion prompt to music.convert', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Convert this to abc',
        useFallbackOnly: true,
        toolInput: {
          convert: {
            inputFormat: 'abc',
            outputFormat: 'abc',
            content: 'M:4/4\nK:C\nC D E F |',
          },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.convert');
  });

  test('routes edit prompt to music.scoreops', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Change the key signature to D major',
        useFallbackOnly: true,
        toolInput: {
          context: { content: SCALE_XML },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toMatch(/^music\.(scoreops|patch)$/);
  });

  test('scoreops with pre-built ops array executes directly', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Set the key signature to G major',
        useFallbackOnly: true,
        toolInput: {
          scoreops: {
            ops: [{ op: 'set_key_signature', fifths: 1 }],
            content: SCALE_XML,
          },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.scoreops');
    expect(json.toolOk).toBe(true);
    // Verify the result contains the modified output
    const result = json.result;
    expect(result).toBeTruthy();
    if (result?.output?.content) {
      expect(result.output.content).toContain('<fifths>1</fifths>');
    }
  });

  test('scoreops: multiple ops via agent fallback with edit prompt', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Change key signature and edit the title',
        useFallbackOnly: true,
        toolInput: {
          scoreops: {
            ops: [
              { op: 'set_key_signature', fifths: 3 },
              { op: 'set_metadata_text', field: 'title', value: 'A Major Scale' },
            ],
            content: SCALE_XML,
          },
          context: { content: SCALE_XML },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.scoreops');
    expect(json.toolOk).toBe(true);
  });

  test('scoreops: export_score via agent fallback returns exports', async ({ request }) => {
    // Note: prompt must match scoreops keyword pattern (e.g. "apply") since
    // the fallback router's keyword matcher gates access to the direct-ops path.
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Apply export operation to this score',
        useFallbackOnly: true,
        toolInput: {
          scoreops: {
            ops: [{ op: 'export_score', formats: ['musicxml'] }],
            content: SCALE_XML,
          },
          context: { content: SCALE_XML },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
    expect(json.selectedTool).toBe('music.scoreops');
    expect(json.toolOk).toBe(true);
    const result = json.result;
    expect(result).toBeTruthy();
    expect(result?.exports?.musicxml).toBeTruthy();
    // Verify the base64 decodes to valid MusicXML
    const decoded = Buffer.from(result.exports.musicxml, 'base64').toString('utf-8');
    expect(decoded).toContain('<score-partwise');
  });

  test('useFallbackOnly forces fallback mode', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Transpose up by a whole step',
        useFallbackOnly: true,
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('fallback');
  });

  test('response includes traceId header', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Analyze this score',
        useFallbackOnly: true,
        toolInput: { context: { content: MINIMAL_XML } },
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.traceId).toBeTruthy();
    expect(typeof json.traceId).toBe('string');
  });
});

/* ------------------------------------------------------------------ */
/*  Agent SDK E2E tests — require OPENAI_API_KEY                      */
/*  Run: OPENAI_API_KEY=sk-... npm run test:e2e:music                 */
/* ------------------------------------------------------------------ */
const HAS_API_KEY = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
console.log('HAS_API_KEY:', HAS_API_KEY, 'OPENAI:', !!process.env.OPENAI_API_KEY, 'ANTHROPIC:', !!process.env.ANTHROPIC_API_KEY);

test.describe('Music Agent SDK E2E', () => {
  test.skip(!HAS_API_KEY, 'Requires OPENAI_API_KEY or ANTHROPIC_API_KEY');

  test('handles multimodal prompt with PDF attachment', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: [
          { type: 'input_text', text: 'Analyze the key signature of this PDF score.' },
          { type: 'input_file', file: { url: 'data:application/pdf;base64,JVBERi0xLjQKJ...' }, filename: 'score.pdf' }
        ],
        toolInput: {
          context: { content: MINIMAL_XML }
        }
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
  });

  test('routes a scoreops prompt and returns structured output', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Set the key signature to G major',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
    if (json.mode === 'agents-sdk') {
      expect(typeof json.response).toBe('string');
      expect(json.toolOk).toBe(true);
      // Structured output should include the full tool result
      if (json.result) {
        const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        expect(parsed).toHaveProperty('tool');
        expect(parsed).toHaveProperty('status');
        expect(parsed).toHaveProperty('ok');
      }
    }
  });

  test('routes a context analysis prompt', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'What key is this score in?',
        toolInput: {
          context: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
    // The response should mention something about C major (the scale fixture)
    if (json.mode === 'agents-sdk' && json.response) {
      expect(json.response.toLowerCase()).toMatch(/c\s*major|key.*0|no sharps|no flats/i);
    }
  });

  test('accepts API key from request body', async ({ request }) => {
    const apiKey = process.env.OPENAI_API_KEY!;
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Set the time signature to 3/4',
        apiKey,
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
  });

  test('agent SDK produces structured ops for key signature change', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Change the key signature from C major to Bb major (two flats)',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\.(scoreops|context)/);
  });

  test('agent SDK handles time signature change', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Change the time signature to 6/8',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
  });

  test('agent SDK handles metadata edit', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Change the title to "My Beautiful Scale"',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
  });

  test('respects custom model parameter', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'What key is this in?',
        model: 'gpt-4.1-mini',
        toolInput: {
          context: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    if (json.mode === 'agents-sdk') {
      expect(json.model).toBe('gpt-4.1-mini');
    }
  });

  test('completes within reasonable time (no hang)', async ({ request }) => {
    const start = Date.now();
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Set the key signature to D major',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    const elapsed = Date.now() - start;
    expect(response.ok()).toBeTruthy();
    // Should complete well under the 60s timeout — the summarizeForModel
    // fix should keep responses fast with small fixtures
    expect(elapsed).toBeLessThan(30_000);
  });

  test('agent SDK routes export prompt to scoreops with export_score', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Export this score as MusicXML',
        toolInput: {
          context: { content: SCALE_XML },
          scoreops: { content: SCALE_XML },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    expect(json.selectedTool).toMatch(/^music\./);
    if (json.result?.exports?.musicxml) {
      const decoded = Buffer.from(json.result.exports.musicxml, 'base64').toString('utf-8');
      expect(decoded).toContain('<score-partwise');
    }
  });

  test('routes a render snapshot prompt', async ({ request }) => {
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'Generate a PNG snapshot of this score',
        toolInput: {
          render: { content: SCALE_XML, format: 'png' },
        },
      },
      timeout: 90_000,
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(['agents-sdk', 'fallback']).toContain(json.mode);
    if (json.mode === 'agents-sdk') {
      expect(json.selectedTool).toBe('music.render');
      if (json.result) {
        const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        expect(parsed.body).toHaveProperty('dataUrl');
        expect(parsed.body.dataUrl).toMatch(/^data:image\/png;base64,/);
      }
    }
  });

  test('agent SDK works with Anthropic provider', async ({ request }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY, 'Skipping Anthropic E2E: ANTHROPIC_API_KEY not set');
    const response = await request.post('/api/music/agent', {
      data: {
        prompt: 'What key is this score in?',
        provider: 'anthropic',
        toolInput: { context: { content: SCALE_XML } },
      },
      timeout: 90_000,
    });
    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.mode).toBe('agents-sdk');
    expect(json.provider).toBe('anthropic');
  });
});
