import { expect, test } from 'playwright/test';

test('time signature change starts at selected note', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readTimeSigs = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      const matches = Array.from(xml.matchAll(/<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/g));
      return matches.map((m) => `${m[1]}/${m[2]}`);
    });
  };

  const initial = await readTimeSigs();
  expect(initial.length).toBeGreaterThan(0);

  const startSig = initial[0];
  const targetSig = startSig === '3/4' ? '4/4' : '3/4';

  const notes = page.locator('svg .Note');
  const noteCount = await notes.count();
  expect(noteCount).toBeGreaterThan(0);
  await notes.nth(noteCount - 1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  const [num, den] = targetSig.split('/').map(Number);
  const dropdown = page.getByTestId('dropdown-signature');
  await dropdown.evaluate(el => {
    (el as HTMLDetailsElement).open = true;
  });
  await dropdown.locator('div').first().waitFor();
  await page.getByTestId(`btn-timesig-${num}-${den}`).click();

  // Start time signature should remain unchanged (change is inserted later in the score).
  await expect.poll(async () => (await readTimeSigs())[0], { timeout: 20_000 }).toBe(startSig);
  await expect.poll(async () => (await readTimeSigs()).length, { timeout: 20_000 }).toBeGreaterThan(1);
  await expect.poll(async () => (await readTimeSigs()).includes(targetSig), { timeout: 20_000 }).toBe(true);
});

test('custom time signature applies at selection', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readTimeSigs = async (): Promise<string[]> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const bytes: Uint8Array = await score.saveMsc('mscx');
      const xml = new TextDecoder().decode(bytes);
      const matches = Array.from(xml.matchAll(/<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/g));
      return matches.map((m) => `${m[1]}/${m[2]}`);
    });
  };

  const notes = page.locator('svg .Note');
  const noteCount = await notes.count();
  expect(noteCount).toBeGreaterThan(0);
  await notes.nth(noteCount - 1).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await page.getByTestId('input-timesig-numerator').fill('5', { force: true });
  await page.getByTestId('input-timesig-denominator').fill('8', { force: true });
  const applyButton = page.getByTestId('btn-timesig-custom');
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  await expect.poll(async () => (await readTimeSigs()).includes('5/8'), { timeout: 20_000 }).toBe(true);
});
