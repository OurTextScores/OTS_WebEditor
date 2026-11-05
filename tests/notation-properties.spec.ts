import { expect, test, type Page } from './helpers/diagnostic-test';
import { runCommand, runCommandAnsweringPrompt } from './helpers/commands';

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

test('a dynamic’s playback velocity is a number in the panel', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 1);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.mark.dynamic', 9);
  await page.waitForSelector('svg .Dynamic', { state: 'attached', timeout: 20_000 });

  await selectAndInspect(page, 'svg .Dynamic', 'Dynamic');
  await page.getByTestId('notation-velocity').fill('70');
  await page.getByTestId('notation-velocity').press('Enter');
  await expect.poll(() => propertyValue(page, 'velocity')).toBe('70');
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

test('Laissez Vibrer adds an l.v. tie, whose placement is a typed property', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 2);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.line.laissezVib');
  await page.waitForSelector('svg .LaissezVibSegment', { state: 'attached', timeout: 20_000 });

  // Clicking the l.v. tie itself selects its note in OTS today (a hit-testing follow-up), so reach it through a
  // range selection, where the typed property applies to whichever selected elements have it.
  const placement = await page.evaluate(async () => {
    const score = (window as unknown as { __webmscore: Record<string, (...args: unknown[]) => Promise<unknown>> }).__webmscore;
    await score.selectAll();
    await score.setElementPropertyValue('tiePlacement', 'outside');
    return ((await score.getElementPropertyValues(['tiePlacement'])) as Record<string, { value: string }>).tiePlacement?.value;
  });
  expect(placement).toBe('outside');
});

test('Enclose ▸ Parentheses puts the selected note in parentheses', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 3);
  await page.mouse.click(note.x, note.y);
  await expect.poll(() => selectedType(page)).toBe('Note');
  await runCommand(page, 'format.enclose', 1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const xml: string = await (window as unknown as { __webmscore: { saveXml(): Promise<string> } }).__webmscore.saveXml();
        return (xml.match(/parentheses="yes"/g) ?? []).length;
      }),
    )
    .toBe(1);
});

test('a beam is feathered and flattened from the panel', async ({ page }) => {
  await page.goto('/?score=/test_scores/men-base.musicxml');
  await page.waitForSelector('svg .Beam', { state: 'attached', timeout: 60_000 });
  await selectAndInspect(page, 'svg .Beam', 'Beam');
  await page.getByTestId('notation-growRight').fill('2');
  await page.getByTestId('notation-growRight').press('Enter');
  await expect.poll(() => propertyValue(page, 'growRight')).toBe('2');
  // The checkbox follows the engine's value, which updates after the edit; click, then read the engine.
  await page.getByTestId('notation-noSlope').click();
  await expect.poll(() => propertyValue(page, 'noSlope')).toBe('true');
});

test('Ctrl+click reaches an l.v. tie under its note, and Delete then removes only the tie', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 2);
  await page.mouse.click(note.x, note.y);
  await runCommand(page, 'add.line.laissezVib');
  await page.waitForSelector('svg .LaissezVibSegment', { state: 'attached', timeout: 20_000 });
  await runCommand(page, 'view.zoom.preset', 1);
  await page.waitForTimeout(500);

  // At 100% the score is wider than the view: bring the tie on screen before reading its position.
  await page.locator('svg .LaissezVibSegment').first().scrollIntoViewIfNeeded();
  await runCommand(page, 'edit.deselect').catch(() => undefined);
  // A point in the tie's body, which lies inside its note's shape: a click selects the note, as in MuseScore.
  const tie = await page.locator('svg .LaissezVibSegment').first().boundingBox();
  if (!tie) throw new Error('no l.v. tie');
  const onCurve = { x: tie.x + tie.width * 0.8, y: tie.y + tie.height / 2 };
  await page.mouse.click(onCurve.x, onCurve.y);
  await expect.poll(() => selectedType(page)).toBe('Note');

  await page.keyboard.down('Control');
  await page.mouse.click(onCurve.x, onCurve.y);
  await page.keyboard.up('Control');
  await expect.poll(() => selectedType(page)).toBe('LaissezVib');

  await runCommand(page, 'edit.delete');
  await expect(page.locator('svg .LaissezVibSegment')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('svg .Note')).toHaveCount(4);
});

test('a staff text’s font, size, bold and highlight are changed from the Text section, and reset', async ({ page }) => {
  const note = await centre(page, 'svg .Note', 0);
  await page.mouse.click(note.x, note.y);
  await runCommandAnsweringPrompt(page, 'add.text.staff', 'Dolce');
  await page.waitForSelector('svg .StaffText', { state: 'attached', timeout: 20_000 });

  const text = await centre(page, 'svg .StaffText');
  await page.mouse.click(text.x, text.y);
  await expect.poll(() => selectedType(page)).toBe('StaffText');
  if (!(await page.getByTestId('inspector-panel').isVisible())) await runCommand(page, 'view.panel.properties');
  await expect(page.getByTestId('text-properties')).toBeVisible();
  await expect(page.getByTestId('notation-style')).toHaveValue('staff');

  await page.getByTestId('notation-family').fill('FreeSans');
  await page.getByTestId('notation-family').press('Enter');
  await expect.poll(() => propertyValue(page, 'family')).toBe('FreeSans');
  await page.getByTestId('notation-size').fill('14');
  await page.getByTestId('notation-size').press('Enter');
  await expect.poll(() => propertyValue(page, 'size')).toBe('14');
  await page.getByTestId('notation-fontStyle-bold').click();
  await expect.poll(() => propertyValue(page, 'fontStyle')).toBe('1');
  await page.getByTestId('notation-frameType').selectOption('1');
  await expect.poll(() => propertyValue(page, 'frameType')).toBe('1');
  await page.getByTestId('notation-frameBgColor').fill('#ffff00');
  await expect.poll(() => propertyValue(page, 'frameBgColor')).toBe('#FFFF00FF');

  await page.getByTestId('notation-size-reset').click();
  await expect.poll(() => propertyValue(page, 'size')).toBe('10');
});
