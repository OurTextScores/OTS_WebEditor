import fs from 'node:fs';
import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

// MEI interchange (roadmap E25): an .mei file opens in the editor through MuseScore's MEI importer, and File ▸ Export ▸
// MEI writes it back through the exporter. The engine side is covered file by file in unit/mei-conformance-engine.test.ts.
const FIXTURE = 'tools/musescore/fixtures/mei-conformance/lyric-01.mei';

test('opens an MEI file and exports it as MEI again', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.getByTestId('open-score-input').setInputFiles(FIXTURE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  // Every note of the file is drawn, and its lyrics.
  const source = fs.readFileSync(FIXTURE, 'utf8');
  await expect(page.locator('svg .Note')).toHaveCount((source.match(/<note /g) ?? []).length);
  await expect(page.locator('svg .Lyrics').first()).toBeVisible();

  const download = page.waitForEvent('download', { timeout: 60_000 });
  await runCommand(page, 'file.export.mei');
  const file = await download;
  expect(file.suggestedFilename()).toBe('score.mei');
  const exported = fs.readFileSync((await file.path())!, 'utf8');
  expect(exported).toContain('meiversion="5.1+basic"');
  // The same notes and syllables come back.
  expect((exported.match(/<note /g) ?? []).length).toBe((source.match(/<note /g) ?? []).length);
  const syllables = (text: string) =>
    [...text.matchAll(/<syl[^>]*>([^<]*)<\/syl>/g)].map((m) => m[1]);
  expect(syllables(exported)).toEqual(syllables(source));
});

test("shows the importer's problems with an MEI file that still opens", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  // Not MEI Basic: MuseScore imports it, but reports that it may be incomplete.
  const source = fs
    .readFileSync(FIXTURE, 'utf8')
    .replace('meiversion="5.1+basic"', 'meiversion="4.0.1"');
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'not-basic.mei',
    mimeType: 'application/mei+xml',
    buffer: Buffer.from(source),
  });
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const notice = page.getByTestId('notice-warning');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('1 problem occurred and the import may be incomplete.');
  await expect(notice).toContainText('does not seem to be a MEI Basic');
});
