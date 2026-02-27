import { expect, test } from '@playwright/test';

test.describe('Music API smoke', () => {
  test('context endpoint returns MusicXML-primary context envelope', async ({ request }) => {
    const response = await request.post('/api/music/context', {
      data: {
        content: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`,
        includeFullXml: false,
      },
    });

    expect(response.ok()).toBeTruthy();
    const json = await response.json();
    expect(json.strategy).toBe('musicxml-primary');
    expect(json.context?.format).toBe('musicxml');
  });

  test('convert endpoint handles same-format abc conversion', async ({ request }) => {
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

  test('generate endpoint supports dry-run without inference call', async ({ request }) => {
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
});

