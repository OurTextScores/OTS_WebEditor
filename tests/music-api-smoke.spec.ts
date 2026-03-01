import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const SCALE_XML = readFileSync(
  resolve(__dirname, '../unit/fixtures/c-major-scale.musicxml'),
  'utf-8',
);

const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`;

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
const HAS_API_KEY = Boolean(process.env.OPENAI_API_KEY);

test.describe('Music Agent SDK E2E', () => {
  test.skip(!HAS_API_KEY, 'Requires OPENAI_API_KEY');

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
});
