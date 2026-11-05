import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { expect, test, type Page } from './helpers/diagnostic-test';
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
  await expect(select.locator('option')).toHaveText([
    'Full score',
    'Make parts from instruments…',
    'Manage parts…',
  ]);
  const fullScoreStaves = await staffLines(page);

  await select.selectOption('generate');
  await expect(select).toHaveValue('0');
  await expect(select.locator('option')).toHaveText([
    'Full score',
    'Violin',
    'Cello',
    'Manage parts…',
  ]);
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
  await expect(select).toHaveValue('1');
  await expect.poll(async () => (await staffLines(page)) > 0).toBe(true);
  const note = await centre(page, 'svg .Note', 1);
  await page.mouse.click(note.x, note.y);
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
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
  const fullScoreStaves = await staffLines(page);
  await select.selectOption('generate');
  await select.selectOption('1'); // Cello
  await expect(select).toHaveValue('1');
  // Counted once the part is drawn: one instrument, so fewer staves than the full score.
  await expect.poll(() => staffLines(page)).toBeLessThan(fullScoreStaves);
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

test("a part's elements offer score and part synchronization; the full score's do not", async ({
  page,
}) => {
  const select = page.getByTestId('part-select');
  await select.selectOption('generate');
  await select.selectOption('1'); // Cello
  await expect(select).toHaveValue('1');
  await expect.poll(async () => (await staffLines(page)) > 0).toBe(true);
  const note = await centre(page, 'svg .Note', 1);
  await page.mouse.click(note.x, note.y);
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await runCommand(page, 'add.mark.dynamic', 9);
  await expect(page.locator('svg .Dynamic')).toHaveCount(1, { timeout: 20_000 });
  const dynamic = await centre(page, 'svg .Dynamic');
  await page.mouse.click(dynamic.x, dynamic.y);
  await runCommand(page, 'view.panel.properties');

  const sync = page.getByTestId('part-sync-properties');
  await expect(sync).toContainText('Score and part synchronization');
  const appearance = page.getByTestId('notation-appearanceLinkedToMaster');
  await expect(appearance).toBeChecked();
  await expect(page.getByTestId('notation-positionLinkedToMaster')).toBeChecked();
  // Unlink it from the score, then synchronize it again.
  // (A controlled checkbox: it shows the engine's value once the edit has run.)
  await appearance.click();
  await expect(appearance).not.toBeChecked();
  await appearance.click();
  await expect(appearance).toBeChecked();

  const partStaves = await staffLines(page);
  await select.selectOption('-1');
  await expect.poll(() => staffLines(page)).toBeGreaterThan(partStaves);
  const scoreDynamic = await centre(page, 'svg .Dynamic');
  await page.mouse.click(scoreDynamic.x, scoreDynamic.y);
  // The dynamic's own properties have loaded; the synchronization section is not among them.
  await expect(page.getByTestId('notation-properties')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('part-sync-properties')).toHaveCount(0);
});

test('the Style dialog says which score it changes', async ({ page }) => {
  const select = page.getByTestId('part-select');
  await select.selectOption('generate');
  await select.selectOption('1');
  await runCommand(page, 'format.style');
  await expect(page.getByTestId('score-dialog-scope')).toHaveText(
    'Applies to the Cello part only.',
  );
  await page.keyboard.press('Escape');
  await select.selectOption('-1');
  await runCommand(page, 'format.style');
  await expect(page.getByTestId('score-dialog-scope')).toHaveText(
    'Applies to the full score; each part has its own.',
  );
});

test('MuseScore export from a part view saves the whole project, parts included, and keeps the view', async ({
  page,
}) => {
  const select = page.getByTestId('part-select');
  const fullScoreStaves = await staffLines(page);
  await select.selectOption('generate');
  await select.selectOption('1');
  await expect(select).toHaveValue('1');
  // Counted once the part is drawn: one instrument, so fewer staves than the full score.
  await expect.poll(() => staffLines(page)).toBeLessThan(fullScoreStaves);
  const partStaves = await staffLines(page);
  const download = page.waitForEvent('download');
  await runCommand(page, 'file.export.mscz');
  const file = await download;
  expect(file.suggestedFilename()).toBe('score.mscz');
  const names = execFileSync('unzip', ['-Z1', (await file.path())!], { encoding: 'utf8' });
  expect(names).toMatch(/\.mscx/);
  expect(names).toMatch(/Excerpts\//);
  await expect(select).toHaveValue('1');
  await expect.poll(() => staffLines(page)).toBe(partStaves);
});

test('Manage Parts renames, creates, duplicates and deletes parts, and undo brings one back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const select = page.getByTestId('part-select');
  const options = () => select.locator('option').allTextContents();
  const fullScoreStaves = await staffLines(page);
  await select.selectOption('generate');
  await expect(select).toHaveValue('0');

  await select.selectOption('manage');
  const dialog = page.getByTestId('manage-parts-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('part-name-0')).toHaveValue('Violin');
  await expect(page.getByTestId('part-name-1')).toHaveValue('Cello');

  // Rename
  await page.getByTestId('part-name-1').fill('Violoncello');
  await page.getByTestId('part-name-1').press('Enter');
  await expect.poll(options).toContain('Violoncello');

  // A new part of both instruments: shown once made, with both staves.
  await page.getByTestId('new-part-name').fill('Duo');
  await page.getByTestId('new-part-instrument-0').check();
  await page.getByTestId('new-part-instrument-1').check();
  await page.getByTestId('btn-new-part').click();
  await expect
    .poll(options)
    .toEqual(['Full score', 'Violin', 'Violoncello', 'Duo', 'Manage parts…']);
  await expect(select).toHaveValue('2');
  await expect.poll(() => staffLines(page)).toBe(fullScoreStaves);

  // Duplicate the Violin part: the copy goes in after it.
  await page.getByTestId('part-duplicate-0').click();
  await expect
    .poll(options)
    .toEqual(['Full score', 'Violin', 'Violin (copy)', 'Violoncello', 'Duo', 'Manage parts…']);
  // The part shown (Duo) is still shown, at its new index.
  await expect(select).toHaveValue('3');

  // Delete the copy, after confirming; undo brings it back.
  await page.getByTestId('part-delete-1').click();
  await page.getByTestId('dialog-confirm').click();
  await expect.poll(options).not.toContain('Violin (copy)');
  await expect(select).toHaveValue('2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await runCommand(page, 'edit.undo');
  await expect.poll(options).toContain('Violin (copy)');
});
