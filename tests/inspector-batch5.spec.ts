import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

test.use({ viewport: { width: 2400, height: 1600 } });

const readMscx = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: { saveMsc?: (format: 'mscx') => Promise<Uint8Array> };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    return new TextDecoder().decode(await score.saveMsc('mscx'));
  });

const selectedProperties = (page: Page) =>
  page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: {
          getSelectedElementProperties?: () => Promise<{
            selectionCount: number;
            elementType: string;
            properties: Record<string, { value: boolean | number | string | null; mixed: boolean }>;
          }>;
        };
      }
    ).__webmscore;
    if (!score?.getSelectedElementProperties) throw new Error('Inspector API is unavailable');
    return score.getSelectedElementProperties();
  });

const loadFixture = async (page: Page) => {
  await page.goto('/?score=/test_scores/batch5_inspector.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
};

const reloadCurrentMscz = async (page: Page) => {
  const bytes = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: {
          saveMsc?: (format: 'mscz') => Promise<Uint8Array>;
          __batch5Replaced?: boolean;
        };
      }
    ).__webmscore;
    if (!score?.saveMsc) throw new Error('window.__webmscore.saveMsc is unavailable');
    score.__batch5Replaced = true;
    return Array.from(await score.saveMsc('mscz'));
  });
  await page.getByTestId('open-score-input').setInputFiles({
    name: 'batch5-inspector.mscz',
    mimeType: 'application/vnd.musescore',
    buffer: Buffer.from(bytes),
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const score = (window as unknown as { __webmscore?: { __batch5Replaced?: boolean } })
            .__webmscore;
          return Boolean(score && !score.__batch5Replaced);
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000, state: 'attached' });
};

test('edits validated note properties through the selection-aware Inspector', async ({ page }) => {
  await loadFixture(page);
  await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('inspector-panel')).toBeVisible();
  await page.locator('svg .Note').first().click();

  await expect(page.getByTestId('inspector-selection-type')).toContainText('Note', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('inspector-small')).toBeVisible();
  await page.getByTestId('inspector-small').click();
  await expect
    .poll(async () => (await selectedProperties(page)).properties.small?.value, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await readMscx(page)).includes('<small>1</small>'), { timeout: 20_000 })
    .toBe(true);

  await page.getByTestId('inspector-stemDirection').selectOption('up');
  await expect
    .poll(async () => (await selectedProperties(page)).properties.stemDirection?.value, {
      timeout: 20_000,
    })
    .toBe('up');

  const offsetX = page.getByTestId('inspector-offsetX');
  await offsetX.fill('1.5');
  await offsetX.press('Enter');
  await expect
    .poll(async () => Number((await selectedProperties(page)).properties.offsetX?.value), {
      timeout: 20_000,
    })
    .toBeCloseTo(1.5, 1);
  const offsetY = page.getByTestId('inspector-offsetY');
  await offsetY.fill('-0.5');
  await offsetY.press('Enter');
  await expect
    .poll(async () => Number((await selectedProperties(page)).properties.offsetY?.value), {
      timeout: 20_000,
    })
    .toBeCloseTo(-0.5, 1);

  await page.getByTestId('inspector-color').fill('#c02030');
  await expect
    .poll(
      async () => String((await selectedProperties(page)).properties.color?.value).toLowerCase(),
      { timeout: 20_000 },
    )
    .toContain('#c02030');

  const rejected = await page.evaluate(async () => {
    const score = (
      window as unknown as {
        __webmscore?: {
          setSelectedElementProperty?: (name: string, value: string) => Promise<boolean>;
        };
      }
    ).__webmscore;
    return score?.setSelectedElementProperty?.('arbitraryPid', '999');
  });
  expect(rejected).toBe(false);

  await page.getByTestId('inspector-selection-type').click();
  await page.keyboard.press('Control+z');
  await expect
    .poll(
      async () => String((await selectedProperties(page)).properties.color?.value).toLowerCase(),
      { timeout: 20_000 },
    )
    .not.toContain('#c02030');
  await page.keyboard.press('Control+y');
  await expect
    .poll(
      async () => String((await selectedProperties(page)).properties.color?.value).toLowerCase(),
      { timeout: 20_000 },
    )
    .toContain('#c02030');

  await page
    .locator('svg .Note')
    .nth(1)
    .click({ modifiers: ['Control'] });
  await expect
    .poll(async () => (await selectedProperties(page)).selectionCount, { timeout: 20_000 })
    .toBe(2);
  await expect
    .poll(async () => (await selectedProperties(page)).properties.color?.mixed, { timeout: 20_000 })
    .toBe(true);

  await page.getByTestId('inspector-visible').click();
  await expect
    .poll(async () => (await selectedProperties(page)).properties.visible?.value, {
      timeout: 20_000,
    })
    .toBe(false);
  await expect
    .poll(async () => (await readMscx(page)).includes('<visible>0</visible>'), { timeout: 20_000 })
    .toBe(true);

  await reloadCurrentMscz(page);
  const reloadedXml = await readMscx(page);
  expect(reloadedXml).toContain('<small>1</small>');
  expect(reloadedXml).toContain('<visible>0</visible>');
  expect(reloadedXml).toContain('<color r="192" g="32" b="48" a="255"/>');
});

test('edits line style on a selected range line', async ({ page }) => {
  await page.goto('/?score=/test_scores/two_notes_cc.musicxml');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  await page.keyboard.press('Control+a');
  await runCommand(page, 'btn-ottava-0');
  const ottava = page.locator('svg .OttavaSegment').first();
  await ottava.waitFor({ timeout: 20_000 });
  await ottava.click();

  await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('inspector-lineStyle')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('inspector-lineStyle').selectOption('solid');
  await expect
    .poll(async () => (await selectedProperties(page)).properties.lineStyle?.value, {
      timeout: 20_000,
    })
    .toBe('solid');
  await expect
    .poll(
      async () => {
        try {
          return /<lineStyle>solid<\/lineStyle>/.test(await readMscx(page));
        } catch {
          return false;
        }
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});

test('edits plain text in place on the score and commits one undo step', async ({ page }) => {
  await loadFixture(page);
  const staffText = page.locator('svg .StaffText, svg .SystemText').first();
  await staffText.waitFor({ timeout: 20_000 });
  const point = await staffText.evaluate((element: SVGGraphicsElement) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await staffText.dispatchEvent('dblclick', {
    bubbles: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });

  const editor = page.getByTestId('inline-text-editor');
  await expect(editor).toBeVisible({ timeout: 20_000 });
  const content = page.getByTestId('inline-text-content');
  await content.fill('Edited in place');
  await content.press('Control+Enter');
  await expect
    .poll(async () => (await readMscx(page)).includes('Edited in place'), { timeout: 20_000 })
    .toBe(true);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await readMscx(page)).includes('Original text'), { timeout: 20_000 })
    .toBe(true);
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () => (await readMscx(page)).includes('Edited in place'), { timeout: 20_000 })
    .toBe(true);

  await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('inspector-placement')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('inspector-placement').selectOption('below');
  await expect
    .poll(async () => (await selectedProperties(page)).properties.placement?.value, {
      timeout: 20_000,
    })
    .toBe('below');
  await expect
    .poll(async () => (await readMscx(page)).includes('<placement>below</placement>'), {
      timeout: 20_000,
    })
    .toBe(true);
});
