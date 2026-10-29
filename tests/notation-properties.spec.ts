import { expect, test, type Page } from 'playwright/test';
import { runCommand } from './helpers/commands';

/**
 * Typed notation properties in the Properties panel (docs/private/MS47_EDITOR_OPPORTUNITIES_ROADMAP.md, E09 with
 * E10 ornaments and E07 dynamics): add the element, select it, change a property, reset it, all in the engine.
 */

const SCORE = '/?score=/test_scores/four_measures.musicxml';

interface PropertiesWindow {
  __webmscore: {
    getElementPropertyValues(names: string[]): Promise<Record<string, { value: string | null }>>;
    getSelectedElementProperties(): Promise<{ elementType: string }>;
  };
}

const propertyValue = (page: Page, name: string) =>
  page.evaluate(
    async (n) => (await (window as unknown as PropertiesWindow).__webmscore.getElementPropertyValues([n]))[n]?.value ?? null,
    name,
  );
const selectedType = (page: Page) =>
  page.evaluate(async () => (await (window as unknown as PropertiesWindow).__webmscore.getSelectedElementProperties()).elementType);

async function centre(page: Page, selector: string, index = 0) {
  let box: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>> = null;
  await expect.poll(async () => (box = await page.locator(selector).nth(index).boundingBox()) !== null).toBe(true);
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Selects the first `selector` element by clicking it, and shows the Properties panel. */
async function selectAndInspect(page: Page, selector: string, type: string) {
  const at = await centre(page, selector);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => selectedType(page)).toBe(type);
  if (!(await page.getByTestId('inspector-panel').isVisible())) await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('notation-properties')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
});

test('an ornament from the Ornaments family has its interval, which the panel edits and resets', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.mark.ornament', 'ornamentTurn');
  await page.waitForSelector('svg .Ornament', { state: 'attached', timeout: 20_000 });

  await selectAndInspect(page, 'svg .Ornament', 'Ornament');
  await expect(page.getByTestId('notation-intervalAbove-step')).toHaveValue('second');
  await page.getByTestId('notation-intervalAbove-step').selectOption('third');
  await expect.poll(() => propertyValue(page, 'intervalAbove')).toBe('third,auto');

  await page.getByTestId('notation-intervalAbove-reset').click();
  await expect.poll(() => propertyValue(page, 'intervalAbove')).toBe('second,auto');
});

test('a dynamic’s voice assignment is edited from the panel, and undo restores it', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 1);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.mark.dynamic', 9);
  await page.waitForSelector('svg .Dynamic', { state: 'attached', timeout: 20_000 });

  await selectAndInspect(page, 'svg .Dynamic', 'Dynamic');
  await page.getByTestId('notation-voiceAssignment').selectOption('currentVoiceOnly');
  await expect.poll(() => propertyValue(page, 'voiceAssignment')).toBe('currentVoiceOnly');

  await runCommand(page, 'edit.undo');
  await expect.poll(() => propertyValue(page, 'voiceAssignment')).toBe('allInInstrument');
});

test('a tremolo’s type is changed from the panel', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.mark.tremolo', 0);
  await page.waitForSelector('svg .TremoloSingleChord', { state: 'attached', timeout: 20_000 });

  await selectAndInspect(page, 'svg .TremoloSingleChord', 'TremoloSingleChord');
  await expect(page.getByTestId('notation-subtype')).toHaveValue('0');
  await page.getByTestId('notation-subtype').selectOption('1');
  await expect.poll(() => propertyValue(page, 'subtype')).toBe('1');
});
