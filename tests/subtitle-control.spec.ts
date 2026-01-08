import { expect, test } from 'playwright/test';

test('subtitle control is populated from metadata', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const subtitleInput = page.getByTestId('input-subtitle');
  await expect(subtitleInput).toBeVisible();

  const subtitleValue = await subtitleInput.inputValue();
  expect(subtitleValue).toContain('Bach: Cello Suite');

  await expect(page.getByTestId('btn-set-subtitle')).toBeVisible();
});

test('title and subtitle persist after save and reload', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const readHeader = async (): Promise<{ title: string; subtitle: string }> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.metadata) {
        throw new Error('window.__webmscore.metadata is not available');
      }
      const metadata = await score.metadata();
      const subtitle =
        typeof score?.subtitle === 'function'
          ? await score.subtitle()
          : (typeof metadata?.subtitle === 'string' ? metadata.subtitle : '');
      return {
        title: typeof metadata?.title === 'string' ? metadata.title : '',
        subtitle,
      };
    });
  };

  const newTitle = 'OTS Title Reload';
  const newSubtitle = 'OTS Subtitle Reload';

  await page.getByTestId('input-title').fill(newTitle);
  await page.getByTestId('btn-set-title').click();
  await page.getByTestId('input-subtitle').fill(newSubtitle);
  await page.getByTestId('btn-set-subtitle').click();

  await expect.poll(async () => (await readHeader()).title, { timeout: 20_000 })
    .toBe(newTitle);
  await expect.poll(async () => (await readHeader()).subtitle, { timeout: 20_000 })
    .toBe(newSubtitle);

  const exportedXml = await page.evaluate(async () => {
    const score = (window as any).__webmscore;
    if (!score?.saveMsc) {
      throw new Error('window.__webmscore.saveMsc is not available');
    }
    const data = await score.saveMsc('mscx');
    return new TextDecoder().decode(data);
  });
  const exportedMscz = await page.evaluate(async () => {
    const score = (window as any).__webmscore;
    if (!score?.saveMsc) {
      throw new Error('window.__webmscore.saveMsc is not available');
    }
    const data = await score.saveMsc('mscz');
    return Array.from(data);
  });

  expect(exportedXml).toContain(newTitle);
  expect(exportedXml).toContain(newSubtitle);

  await page.getByTestId('input-title').fill('Temp Title');
  await page.getByTestId('input-subtitle').fill('Temp Subtitle');

  await page.getByTestId('open-score-input').setInputFiles({
    name: 'reloaded.mscz',
    mimeType: 'application/vnd.musescore.mscz',
    buffer: Buffer.from(exportedMscz),
  });

  await page.waitForSelector('svg .Clef', { timeout: 60_000 });
  await expect.poll(async () => await page.getByTestId('input-title').inputValue(), { timeout: 20_000 })
    .toBe(newTitle);
  await expect.poll(async () => await page.getByTestId('input-subtitle').inputValue(), { timeout: 20_000 })
    .toBe(newSubtitle);
});
