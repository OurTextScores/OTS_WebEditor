import { expect, test, type Page } from 'playwright/test';
import { openMenuPath, runCommand } from './helpers/commands';

/**
 * File ▸ Open Score from Link: a score at a web address opens in this editor through the
 * editor's own `?score=` loading, as a new history entry.
 */
const FIRST = '/test_scores/three_notes_cde.musicxml';
const LINKED = '/test_scores/bach_orig.mscz';

async function openEditor(page: Page) {
  await page.goto(`/?score=${encodeURIComponent(FIRST)}`);
  await page.waitForSelector('svg .Note', { timeout: 120_000 });
}

const noteCount = (page: Page) => page.locator('svg .Note').count();

const chooseOpenFromLink = (page: Page) => openMenuPath(page, ['File', 'Open Score from Link']);

async function answerPrompt(page: Page, link: string) {
  const prompt = page.getByTestId('prompt-dialog');
  await expect(prompt).toBeVisible();
  await page.getByTestId('prompt-dialog-input').fill(link);
  await prompt.getByTestId('dialog-confirm').click();
}

test('opens a score from a link, and Back returns to the one before', async ({ page, baseURL }) => {
  await openEditor(page);
  const before = await noteCount(page);
  expect(before).toBeLessThan(10);

  await chooseOpenFromLink(page);
  await answerPrompt(page, new URL(LINKED, baseURL).href);

  // The Bach has far more notes than three.
  await expect.poll(() => noteCount(page), { timeout: 120_000 }).toBeGreaterThan(50);
  const url = new URL(page.url());
  expect(url.searchParams.get('score')).toBe(new URL(LINKED, baseURL).href);

  await page.goBack();
  await expect.poll(() => noteCount(page), { timeout: 120_000 }).toBe(before);
  expect(new URL(page.url()).searchParams.get('score')).toBe(FIRST);
});

test('File ▸ Open Score from Link asks for the address and turns away one that is not a link', async ({
  page,
}) => {
  await openEditor(page);
  const before = page.url();
  await chooseOpenFromLink(page);
  await answerPrompt(page, 'bach_orig.mscz');
  await expect(page.getByText('That is not a web address.', { exact: false })).toBeVisible();
  expect(page.url()).toBe(before);
});

test('opening a link over unsaved changes asks first, and Cancel keeps the score', async ({
  page,
  baseURL,
}) => {
  await openEditor(page);
  await page.locator('svg .Note').first().click();
  await runCommand(page, 'edit.pitch.up');
  const before = page.url();

  await chooseOpenFromLink(page);
  await answerPrompt(page, new URL(LINKED, baseURL).href);
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText('Open another score?');
  await confirm.getByRole('button', { name: 'Cancel' }).click();

  await expect(confirm).toBeHidden();
  expect(page.url()).toBe(before);
  expect(await noteCount(page)).toBeLessThan(10);
});
