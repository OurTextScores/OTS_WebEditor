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
  const ensureDropdownOpen = async () => {
    await dropdown.evaluate(el => {
      (el as HTMLDetailsElement).open = true;
    });
    await expect(dropdown.locator('div').first()).toBeVisible();
  };
  const clickPartAction = async (testId: string) => {
    await dropdown.evaluate((el, id) => {
      (el as HTMLDetailsElement).open = true;
      const button = el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
      button?.click();
    }, testId);
  };

  await ensureDropdownOpen();
  await expect.poll(async () => await dropdown.locator('select option').count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await dropdown.locator('select').selectOption({ index: 0 });
  await ensureDropdownOpen();
  const addButton = dropdown.getByRole('button', { name: 'Add Instrument' });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  await expect.poll(async () => (await readParts()).length, { timeout: 20_000 })
    .toBe(initialParts.length + 1);

  const afterAddParts = await readParts();
  const newIndex = afterAddParts.length - 1;
  const previousVisibility = String(afterAddParts[newIndex]?.isVisible ?? '');

  await ensureDropdownOpen();
  const visibilityButton = dropdown.getByTestId(`btn-part-visible-${newIndex}`);
  const previousLabel = (await visibilityButton.textContent())?.trim() ?? '';
  await clickPartAction(`btn-part-visible-${newIndex}`);

  await expect.poll(async () => {
    const parts = await readParts();
    return String(parts[newIndex]?.isVisible ?? '');
  }, { timeout: 20_000 }).not.toBe(previousVisibility);

  await ensureDropdownOpen();
  await expect.poll(async () => {
    const label = await dropdown.getByTestId(`btn-part-visible-${newIndex}`).textContent();
    return label?.trim() ?? '';
  }, { timeout: 20_000 }).not.toBe(previousLabel);

  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('Remove');
    dialog.accept();
  });
  await clickPartAction(`btn-part-remove-${newIndex}`);

  await expect.poll(async () => (await readParts()).length, { timeout: 20_000 })
    .toBe(initialParts.length);
});
