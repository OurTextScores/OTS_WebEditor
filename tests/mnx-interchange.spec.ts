import fs from 'node:fs';
import { expect, test } from './helpers/diagnostic-test';
import { runCommand } from './helpers/commands';

// MNX interchange (roadmap E29): an .mnx file opens in the editor through MuseScore's MNX importer, and File ▸ Export ▸
// MNX writes it back through the exporter. The engine side is covered file by file in unit/mnx-conformance-engine.test.ts.
const FIXTURE = 'tools/musescore/fixtures/mnx-conformance/w3c/lyrics-basic.json';

test('opens an MNX file and exports it as MNX again', async ({ page }) => {
  test.setTimeout(180_000);
  const source = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  await page.goto('/');
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'lyrics-basic.mnx',
    mimeType: 'application/vnd.mnx+json',
    buffer: fs.readFileSync(FIXTURE),
  });
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.locator('svg .Lyrics').first()).toBeVisible();

  const download = page.waitForEvent('download', { timeout: 60_000 });
  await runCommand(page, 'file.export.mnx');
  const file = await download;
  expect(file.suggestedFilename()).toBe('score.mnx');
  const exported = JSON.parse(fs.readFileSync((await file.path())!, 'utf8'));
  // Written to the schema version MuseScore embeds, which can be newer than the file's.
  expect(exported.mnx.version).toBeGreaterThanOrEqual(source.mnx.version);
  // The same measures and syllables come back.
  expect(exported.global.measures).toHaveLength(source.global.measures.length);
  const syllables = (doc: unknown) =>
    [...JSON.stringify(doc).matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]);
  expect(syllables(exported)).toEqual(syllables(source));
});
