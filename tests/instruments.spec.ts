import { expect, test } from 'playwright/test';

test('instruments can be added, hidden, and removed', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const hasInstrumentApi = await page.evaluate(() => {
    return typeof (window as any).__webmscore?.listInstrumentTemplates === 'function';
  });
  test.skip(!hasInstrumentApi, 'Instrument APIs not available in this webmscore build');

  const readParts = async () => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.metadata) {
        throw new Error('window.__webmscore.metadata is not available');
      }
      const metadata = await score.metadata();
      return Array.isArray(metadata?.parts) ? metadata.parts : [];
    });
  };

  const initialParts = await readParts();

  const dropdown = page.getByTestId('dropdown-instruments');
  await dropdown.locator('summary').click();
  await dropdown.locator('select option').first().waitFor();
  await dropdown.locator('select').selectOption({ index: 0 });
  await dropdown.getByRole('button', { name: 'Add Instrument' }).click();

  await expect.poll(async () => (await readParts()).length, { timeout: 20_000 })
    .toBe(initialParts.length + 1);

  const afterAddParts = await readParts();
  const newIndex = afterAddParts.length - 1;
  const previousVisibility = String(afterAddParts[newIndex]?.isVisible ?? '');

  await dropdown.locator('summary').click();
  await dropdown.getByTestId(`btn-part-visible-${newIndex}`).click();

  await expect.poll(async () => {
    const parts = await readParts();
    return String(parts[newIndex]?.isVisible ?? '');
  }, { timeout: 20_000 }).not.toBe(previousVisibility);

  await dropdown.locator('summary').click();
  page.once('dialog', dialog => dialog.accept());
  await dropdown.getByTestId(`btn-part-remove-${newIndex}`).click();

  await expect.poll(async () => (await readParts()).length, { timeout: 20_000 })
    .toBe(initialParts.length);
});
