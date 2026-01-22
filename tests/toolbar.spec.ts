import { test, expect } from '@playwright/test';

test('toolbar shows enabled add-measures apply button', async ({ page }) => {
  page.on('console', (msg) => {
    console.log('PAGE LOG:', msg.type(), msg.text());
  });
  page.on('requestfailed', (request) => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });
  page.on('response', (response) => {
    if (response.status() === 404) {
      console.log('RESPONSE 404:', response.url());
    }
  });
  page.on('pageerror', (err) => {
    console.log('PAGE ERROR:', err.message);
  });
  await page.goto('/?score=/test_scores/single_note_c4.musicxml', { waitUntil: 'networkidle' });
  await page.waitForSelector('svg', { timeout: 20000 });
  await page.waitForFunction(() => Boolean((window as any).__webmscore), { timeout: 20000 });
  await page.waitForFunction(() => Boolean((window as any).__webmscore?.insertMeasures), { timeout: 20000 });
  const hasInsert = await page.evaluate(() => Boolean((window as any).__webmscore?.insertMeasures));
  const scoreProps = await page.evaluate(() => {
    const score = (window as any).__webmscore;
    if (!score) {
      return { own: [], proto: [], hasInsert: false };
    }
    const proto = Object.getPrototypeOf(score);
    return {
      hasInsert: Boolean(score.insertMeasures),
      own: Object.getOwnPropertyNames(score),
      proto: proto ? Object.getOwnPropertyNames(proto) : [],
    };
  });
  console.log('PAGE LOG: score properties', JSON.stringify(scoreProps));
  console.log('PAGE LOG: has insertMeasures', hasInsert);
  const applyButton = page.getByTestId('btn-insert-measures');
  await expect(applyButton).toBeVisible();
  await expect(applyButton).toBeEnabled();
});

test('remove trailing empty measures button works', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  const readMscx = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveMsc) {
        throw new Error('window.__webmscore.saveMsc is not available');
      }
      const data = await score.saveMsc('mscx');
      return new TextDecoder().decode(data);
    });
  };

  const countMeasures = (xml: string) => (xml.match(/<Measure>/g) || []).length;

  // Get initial measure count
  const initialMeasures = countMeasures(await readMscx());

  // Add 3 empty measures at the end
  await page.getByTestId('select-measure-target').click();
  await page.getByRole('option', { name: 'End' }).click();
  await page.getByTestId('input-measure-count').fill('3');
  await page.getByTestId('btn-insert-measures').click();

  // Wait for measures to be added
  await expect.poll(async () => countMeasures(await readMscx()), { timeout: 20_000 }).toBe(initialMeasures + 3);

  // Click "Remove Trailing Empty" button
  await page.getByTestId('btn-remove-trailing-empty').click();

  // Verify the empty measures were removed
  await expect.poll(async () => countMeasures(await readMscx()), { timeout: 20_000 }).toBe(initialMeasures);

  // Test undo - measures should come back
  await page.keyboard.press('Control+Z');
  await expect.poll(async () => countMeasures(await readMscx()), { timeout: 20_000 }).toBe(initialMeasures + 3);

  // Test redo - measures should be removed again
  await page.keyboard.press('Control+Y');
  await expect.poll(async () => countMeasures(await readMscx()), { timeout: 20_000 }).toBe(initialMeasures);
});
