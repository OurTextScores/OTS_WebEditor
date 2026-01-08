import { expect, test, Page } from 'playwright/test';

const loadSingleNoteScore = async (page: Page) => {
  await page.goto('/?score=/test_scores/single_note_c4.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
};

const readMscx = async (page: Page): Promise<string> => {
  return page.evaluate(async () => {
    const score = (window as any).__webmscore;
    if (!score?.saveMsc) {
      throw new Error('window.__webmscore.saveMsc is not available');
    }
    const bytes: Uint8Array = await score.saveMsc('mscx');
    return new TextDecoder().decode(bytes);
  });
};

const openRepeatsDropdown = async (page: Page) => {
  const dropdown = page.getByTestId('dropdown-repeats');
  await dropdown.evaluate((el: HTMLElement) => {
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
    }
  });
  await dropdown.getByTestId('btn-repeat-start').waitFor({ state: 'visible' });
  return dropdown;
};

const countMatches = (value: string, pattern: RegExp): number => {
  return (value.match(pattern) || []).length;
};

test('repeat start adds startRepeat', async ({ page }) => {
  await loadSingleNoteScore(page);
  const before = await readMscx(page);
  const startRepeatBefore = countMatches(before, /<startRepeat\/>/g);

  const dropdown = await openRepeatsDropdown(page);
  await dropdown.getByTestId('btn-repeat-start').click();

  await expect
    .poll(async () => countMatches(await readMscx(page), /<startRepeat\/>/g), { timeout: 20_000 })
    .toBeGreaterThan(startRepeatBefore);
});

test('repeat count sets endRepeat', async ({ page }) => {
  await loadSingleNoteScore(page);

  const dropdown = await openRepeatsDropdown(page);
  await dropdown.getByTestId('btn-repeat-count-3').click();

  await expect
    .poll(async () => (await readMscx(page)).includes('<endRepeat>3</endRepeat>'), { timeout: 20_000 })
    .toBe(true);
});

test('barline double applies subtype', async ({ page }) => {
  await loadSingleNoteScore(page);
  const before = await readMscx(page);
  const doubleBarBefore = countMatches(before, /<subtype>double<\/subtype>/g);

  const dropdown = await openRepeatsDropdown(page);
  await dropdown.getByTestId('btn-barline-2').click();

  await expect
    .poll(async () => countMatches(await readMscx(page), /<subtype>double<\/subtype>/g), { timeout: 20_000 })
    .toBeGreaterThan(doubleBarBefore);
});

test('volta 1 adds volta spanner', async ({ page }) => {
  await loadSingleNoteScore(page);
  const before = await readMscx(page);
  const voltaBefore = countMatches(before, /<Volta\b/g);

  const dropdown = await openRepeatsDropdown(page);
  await dropdown.getByTestId('btn-volta-1').click();

  await expect
    .poll(async () => countMatches(await readMscx(page), /<Volta\b/g), { timeout: 20_000 })
    .toBeGreaterThan(voltaBefore);
});
