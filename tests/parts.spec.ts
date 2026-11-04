import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

// Parts (roadmap E18, slice 1): the status bar shows the full score or one part; parts are made from the instruments
// when the score has none; an edit in a part reaches the full score (linked parts); and the whole-score tools return
// to the full score before they read it.
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
