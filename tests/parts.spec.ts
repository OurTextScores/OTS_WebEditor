import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

// Parts (roadmap E18, slice 1): the status bar shows the full score or one part; parts are made from the instruments
// when the score has none; an edit in a part reaches the full score (linked parts); the whole-score tools return to
// the full score before they read it; and exports are of the shown part, or of all parts at once (slice 2).
const SCORE = '/?score=/test_scores/two_staves_four_bars.musicxml'; // Violin and Cello

async function centre(page: Page, selector: string, index = 0) {
  let box: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>> = null;
  await expect
    .poll(async () => (box = await page.locator(selector).nth(index).boundingBox()) !== null)
    .toBe(true);
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
const staffLines = (page: Page) => page.locator('svg .StaffLines').count();

test.beforeEach(async ({ page }) => {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
});

test('makes parts from the instruments and shows each, with the full score one choice away', async ({
  page,
}) => {
  const select = page.getByTestId('part-select');
  await expect(select).toHaveValue('-1');
  await expect(select.locator('option')).toHaveText(['Full score', 'Make parts from instruments…']);
  const fullScoreStaves = await staffLines(page);

  await select.selectOption('generate');
  await expect(select).toHaveValue('0');
  await expect(select.locator('option')).toHaveText(['Full score', 'Violin', 'Cello']);
  // One instrument: half the staves of the two-instrument score.
  await expect.poll(() => staffLines(page)).toBe(fullScoreStaves / 2);

  await select.selectOption('1');
  await expect(select).toHaveValue('1');
  await expect.poll(() => staffLines(page)).toBe(fullScoreStaves / 2);

  await select.selectOption('-1');
  await expect.poll(() => staffLines(page)).toBe(fullScoreStaves);
});

test('an edit in a part reaches the full score', async ({ page }) => {
  const select = page.getByTestId('part-select');
  await select.selectOption('generate');
  await select.selectOption('1'); // Cello
  await expect(page.locator('svg .Dynamic')).toHaveCount(0);
  const note = await centre(page, 'svg .Note', 1);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.mark.dynamic', 9);
  await expect(page.locator('svg .Dynamic')).toHaveCount(1, { timeout: 20_000 });

  await select.selectOption('-1');
  await expect(page.locator('svg .Dynamic')).toHaveCount(1, { timeout: 20_000 });
  await select.selectOption('0'); // Violin: not in this part
  await expect(page.locator('svg .Dynamic')).toHaveCount(0, { timeout: 20_000 });
});

test('the whole-score tools return to the full score before reading it', async ({ page }) => {
  // The AI patch request sends the score's MusicXML: from a part view it must still be the whole score.
  let content = '';
  await page.route('**/api/music/patch', async (route) => {
    content = String(route.request().postDataJSON()?.content ?? '');
    await route.fulfill({
      status: 500,
      body: JSON.stringify({ error: 'not needed for this test' }),
    });
  });
  const select = page.getByTestId('part-select');
  await select.selectOption('generate');
  await expect(select).toHaveValue('0');

  await runCommand(page, 'ai.open.assistant');
  await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
  await page.getByPlaceholder('Paste your key').fill('test-key');
  await page
    .getByPlaceholder('Describe the change you want in the MusicXML.')
    .fill('Add a dynamic.');
  await page.getByRole('button', { name: 'Generate Patch' }).click();

  await expect.poll(() => content, { timeout: 20_000 }).toContain('<score-partwise');
  expect(content).toContain('<part-name>Violin</part-name>');
  expect(content).toContain('<part-name>Cello</part-name>');
  await expect(select).toHaveValue('-1');
});

test('exports the shown part, named for it, and all parts as one ZIP of PDFs', async ({ page }) => {
  test.setTimeout(180_000);
  const select = page.getByTestId('part-select');
  await select.selectOption('generate');
  await select.selectOption('1'); // Cello
  const partStaves = await staffLines(page);

  const pdfDownload = page.waitForEvent('download');
  await runCommand(page, 'file.export.pdf');
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe('score-Cello.pdf');
  expect(
    fs
      .readFileSync((await pdf.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');

  const zipDownload = page.waitForEvent('download');
  await runCommand(page, 'file.export.parts');
  const zip = await zipDownload;
  expect(zip.suggestedFilename()).toMatch(/ - parts\.zip$/);
  const file = (await zip.path())!;
  expect(execFileSync('unzip', ['-t', file], { encoding: 'utf8' })).toContain('No errors detected');
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  expect(names).toEqual(['Score.pdf', 'Violin.pdf', 'Cello.pdf']);
  for (const name of names) {
    expect(execFileSync('unzip', ['-p', file, name]).subarray(0, 5).toString()).toBe('%PDF-');
  }
  // The view is still the Cello part.
  await expect(select).toHaveValue('1');
  expect(await staffLines(page)).toBe(partStaves);
});
