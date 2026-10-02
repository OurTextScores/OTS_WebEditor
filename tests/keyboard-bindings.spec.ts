import { expect, test, type Page } from 'playwright/test';

/**
 * Pins what every editing key does *today*, at the engine boundary, so the keyboard layer can be
 * rebuilt (docs/private/COMMAND_REGISTRY_DESIGN_2026-10-02.md, W2) without changing behaviour by
 * accident. Each case presses one key and asserts the engine call it produces; the engine is
 * spied on rather than read back, because several of these (selection moves, input state) change
 * nothing in the exported score.
 *
 * `__keyCalls` records `[method, args]` for the methods below. A key that must do nothing is
 * asserted by the absence of any call.
 */

const WATCHED = [
  'pitchUp',
  'pitchDown',
  'transpose',
  'setDurationType',
  'toggleDot',
  'setAccidental',
  'addPitchByStep',
  'enterRest',
  'addSlur',
  'addTie',
  'deleteSelection',
  'selectAll',
  'selectNextChord',
  'selectPrevChord',
  'extendSelectionNextChord',
  'extendSelectionPrevChord',
  'extendSelectionNextMeasure',
  'extendSelectionPrevMeasure',
  'extendSelectionStaffAbove',
  'extendSelectionStaffBelow',
  'setInputDurationType',
  'toggleInputDot',
  'setInputAccidentalType',
  'undo',
  'redo',
  'addArticulation',
  'addHairpin',
  'doubleDuration',
  'halfDuration',
  'changeSelectedElementsVoice',
  'insertMeasures',
  'toggleLineBreak',
  'togglePageBreak',
  'synthAudioBatch',
  'saveAudio',
] as const;

type Call = [string, unknown[]];

async function load(page: Page, selectNote: boolean) {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await page.evaluate(
    (names) => {
      const score = (
        window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
      ).__webmscore;
      const calls: Call[] = [];
      (window as unknown as { __keyCalls: Call[] }).__keyCalls = calls;
      for (const name of names) {
        const original = score[name]?.bind(score);
        if (!original) continue;
        score[name] = (...args: unknown[]) => {
          calls.push([name, args]);
          return original(...args);
        };
      }
    },
    WATCHED as unknown as string[],
  );
  if (selectNote) {
    await page.locator('svg .Note').first().click();
    await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  }
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __keyCalls: Call[] }).__keyCalls);

const clear = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __keyCalls: Call[] }).__keyCalls.length = 0;
  });

const firstCall = async (page: Page) => (await calls(page))[0];

// [key, engine method, args]. `undefined` args means "do not care about the arguments".
const WITH_SELECTION: [string, string, unknown[] | undefined][] = [
  ['ArrowUp', 'pitchUp', []],
  ['ArrowDown', 'pitchDown', []],
  ['Control+ArrowUp', 'transpose', undefined],
  ['Control+ArrowDown', 'transpose', undefined],
  ['ArrowRight', 'selectNextChord', []],
  ['ArrowLeft', 'selectPrevChord', []],
  ['Shift+ArrowRight', 'extendSelectionNextChord', []],
  ['Shift+ArrowLeft', 'extendSelectionPrevChord', []],
  ['Control+Shift+ArrowRight', 'extendSelectionNextMeasure', []],
  ['Control+Shift+ArrowLeft', 'extendSelectionPrevMeasure', []],
  ['Shift+ArrowUp', 'extendSelectionStaffAbove', []],
  ['Shift+ArrowDown', 'extendSelectionStaffBelow', []],
  ['5', 'setDurationType', [4]],
  ['3', 'setDurationType', [6]],
  ['.', 'toggleDot', []],
  ['+', 'setAccidental', [3]],
  ['-', 'setAccidental', [1]],
  ['=', 'setAccidental', [2]],
  ['0', 'enterRest', []],
  ['c', 'addPitchByStep', [0, false, false]],
  ['Shift+C', 'addPitchByStep', [0, true, false]],
  ['s', 'addSlur', []],
  ['Shift+S', 'addArticulation', ['articStaccatoAbove']],
  ['Shift+N', 'addArticulation', ['articTenutoAbove']],
  ['Shift+O', 'addArticulation', ['articMarcatoAbove']],
  ['Shift+<', 'addHairpin', [0]],
  ['Shift+>', 'addHairpin', [1]],
  ['Control+Alt+2', 'changeSelectedElementsVoice', [1]],
  ['Control+b', 'insertMeasures', undefined],
  ['w', 'doubleDuration', []],
  ['q', 'halfDuration', []],
  ['Enter', 'toggleLineBreak', []],
  ['Control+Enter', 'togglePageBreak', []],
  ['Delete', 'deleteSelection', []],
  ['Backspace', 'deleteSelection', []],
  ['Control+a', 'selectAll', []],
  ['Control+z', 'undo', []],
  ['Control+y', 'redo', []],
  ['Control+Shift+z', 'redo', []],
];

test.describe('with a note selected', () => {
  for (const [key, method, args] of WITH_SELECTION) {
    test(`${key} -> ${method}`, async ({ page }) => {
      await load(page, true);
      await clear(page);
      await page.keyboard.press(key);
      await expect.poll(async () => (await firstCall(page))?.[0], { timeout: 10_000 }).toBe(method);
      if (args) expect((await firstCall(page))?.[1]).toEqual(args);
    });
  }

  // Desktop MuseScore binds plain T to Tie (shortcuts.xml: tie=T).
  test('t -> addTie', async ({ page }) => {
    await load(page, true);
    await clear(page);
    await page.keyboard.press('t');
    await expect.poll(async () => (await firstCall(page))?.[0], { timeout: 10_000 }).toBe('addTie');
  });
});

test.describe('with nothing selected', () => {
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowRight', 'Delete', '5', 's', 'c']) {
    test(`${key} does not reach the engine`, async ({ page }) => {
      await load(page, false);
      await clear(page);
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
      expect(await calls(page)).toEqual([]);
    });
  }
});

test.describe('in note input', () => {
  const enter = async (page: Page) => {
    await load(page, true);
    await page.keyboard.press('n');
    await expect(page.getByTestId('btn-note-input')).toHaveAttribute('aria-pressed', 'true');
    await clear(page);
  };

  for (const [key, method, args] of [
    ['5', 'setInputDurationType', [4]],
    ['.', 'toggleInputDot', []],
    ['+', 'setInputAccidentalType', [3]],
    ['-', 'setInputAccidentalType', [1]],
    ['=', 'setInputAccidentalType', [2]],
    ['c', 'addPitchByStep', [0, false, false]],
    ['Shift+E', 'addPitchByStep', [2, true, false]],
    ['0', 'enterRest', []],
  ] as [string, string, unknown[]][]) {
    test(`${key} -> ${method}`, async ({ page }) => {
      await enter(page);
      await page.keyboard.press(key);
      await expect.poll(async () => (await firstCall(page))?.[0], { timeout: 10_000 }).toBe(method);
      expect((await firstCall(page))?.[1]).toEqual(args);
    });
  }

  test('Escape leaves note input', async ({ page }) => {
    await enter(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('btn-note-input')).toHaveAttribute('aria-pressed', 'false');
  });

  test('arrows do not move the selection or the pitch', async ({ page }) => {
    await enter(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);
    expect(await calls(page)).toEqual([]);
  });
});

test('keys typed into a text field are not editing keys', async ({ page }) => {
  await load(page, true);
  await page.getByTestId('palette-search').fill('');
  await page.getByTestId('palette-search').focus();
  await clear(page);
  await page.keyboard.type('5s');
  await page.waitForTimeout(500);
  expect(await calls(page)).toEqual([]);
});

test.describe('Escape', () => {
  test('closes note input first, then clears the selection', async ({ page }) => {
    await load(page, true);
    await page.keyboard.press('n');
    await expect(page.getByTestId('btn-note-input')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('btn-note-input')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selection-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0);
  });

  test('closes the floating palettes before it touches the selection', async ({ page }) => {
    await load(page, true);
    await page.getByTestId('btn-palettes-pop-out').click();
    await expect(page.getByTestId('floating-palettes')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('floating-palettes')).toHaveCount(0);
    await expect(page.getByTestId('selection-overlay')).toBeVisible();
  });

  test('does nothing, and leaves the key to the browser, with nothing to cancel', async ({
    page,
  }) => {
    await load(page, false);
    const prevented = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          window.addEventListener('keydown', (event) => resolve(event.defaultPrevented), {
            once: true,
          });
          document.body.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
          );
        }),
    );
    expect(prevented).toBe(false);
  });
});

test('Space starts playback from the canvas', async ({ page }) => {
  await load(page, false);
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __otsCommands: { list(): { id: string; enabled: boolean }[] } }
      ).__otsCommands
        .list()
        .some((c) => c.id === 'playback.playPause' && c.enabled),
    undefined,
    { timeout: 60_000 },
  );
  await clear(page);
  await page.keyboard.press('Space');
  await expect
    .poll(
      async () =>
        (await calls(page)).some(([name]) => name === 'synthAudioBatch' || name === 'saveAudio'),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
});
