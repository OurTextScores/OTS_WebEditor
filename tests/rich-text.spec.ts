import { expect, test, type Page } from 'playwright/test';
import { runCommandAnsweringPrompt } from './helpers/commands';

/**
 * Rich text in the inline editor (roadmap E17): formatting part of a text from the editor's toolbar, and editing a
 * formatted text without losing its formatting (the editor used to save plain text, flattening it).
 */

const staffTextMarkup = async (page: Page) => {
  const mscx = await page.evaluate(async () => {
    const score = (window as unknown as { __webmscore: { saveMsc(format: 'mscx'): Promise<Uint8Array> } }).__webmscore;
    return new TextDecoder().decode(await score.saveMsc('mscx'));
  });
  return mscx.match(/<StaffText>[\s\S]*?<text>([\s\S]*?)<\/text>/)?.[1] ?? null;
};

async function openEditor(page: Page) {
  const text = page.locator('svg .StaffText').first();
  await text.waitFor({ timeout: 20_000 });
  const point = await text.evaluate((element: SVGGraphicsElement) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await text.dispatchEvent('dblclick', { bubbles: true, button: 0, clientX: point.x, clientY: point.y });
  await expect(page.getByTestId('inline-text-editor')).toBeVisible({ timeout: 20_000 });
  return page.getByTestId('inline-text-content');
}

test('bold from the editor’s toolbar is kept, and survives editing the text again', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('no note');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await runCommandAnsweringPrompt(page, 'add.text.staff', 'Dolce');
  await expect.poll(() => staffTextMarkup(page), { timeout: 20_000 }).toBe('Dolce');

  // Select the first three letters and make them bold.
  let content = await openEditor(page);
  await expect(content).toHaveText('Dolce');
  await content.evaluate((node) => {
    const range = document.createRange();
    range.setStart(node.firstChild!, 0);
    range.setEnd(node.firstChild!, 3);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByTestId('rich-text-bold').click();
  await content.press('Control+Enter');
  await expect.poll(() => staffTextMarkup(page), { timeout: 20_000 }).toBe('<b>Dol</b>ce');

  // Edit it again: the editor shows the bold, and typing at the end keeps it.
  content = await openEditor(page);
  await expect(content.locator('b')).toHaveText('Dol');
  await content.press('End');
  await page.keyboard.type(' sempre');
  await content.press('Control+Enter');
  await expect.poll(() => staffTextMarkup(page), { timeout: 20_000 }).toBe('<b>Dol</b>ce sempre');
});

test('Ctrl+I in the editor italicises the selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('no note');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await runCommandAnsweringPrompt(page, 'add.text.staff', 'Dolce');
  const content = await openEditor(page);
  await content.press('Control+a');
  await content.press('Control+i');
  await content.press('Control+Enter');
  await expect.poll(() => staffTextMarkup(page), { timeout: 20_000 }).toBe('<i>Dolce</i>');
});

test('special characters: a music symbol and an accented letter go in at the caret', async ({ page }) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('no note');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await runCommandAnsweringPrompt(page, 'add.text.staff', 'Dolce');
  const content = await openEditor(page);
  await expect(content).toHaveText('Dolce');
  await content.press('End');

  await page.getByTestId('rich-text-special').click();
  await page.getByTestId('special-sym-dynamicForte').click();
  await page.getByTestId('special-char-233').click();
  // The symbol shows as its glyph in the editor.
  await expect(content.locator('[data-sym="dynamicForte"]')).toHaveText(String.fromCodePoint(0xe522));
  await page.getByText('Save', { exact: true }).click();
  await expect.poll(() => staffTextMarkup(page), { timeout: 20_000 }).toBe('Dolce<sym>dynamicForte</sym>é');
});
