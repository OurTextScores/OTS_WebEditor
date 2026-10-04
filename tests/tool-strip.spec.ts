import { expect, test, type Page } from 'playwright/test';

/** Counts calls to an engine method on the live score, so a click can be tied to what the engine was asked to do. */
async function spyOnEngine(page: Page, method: string) {
  await page.evaluate((name) => {
    const score = (
      window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
    ).__webmscore;
    const original = score[name].bind(score);
    const calls: unknown[][] = [];
    (window as unknown as Record<string, unknown>).__spyCalls = calls;
    score[name] = (...args: unknown[]) => {
      calls.push(args);
      return original(...args);
    };
  }, method);
  return () =>
    page.evaluate(() => (window as unknown as { __spyCalls: unknown[][] }).__spyCalls.length);
}

async function open(page: Page, selectNote: boolean) {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  if (selectNote) {
    await page.locator('svg .Note').first().click();
    await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  }
}

test('the tools flow on after the quick controls in one toolbar, with no scrollbar', async ({
  page,
}) => {
  for (const width of [1280, 900, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page, false);
    const row = page.getByTestId('tool-strip-row');
    await expect(page.getByTestId('tool-strip')).toBeVisible();
    for (const id of [
      'btn-note-input',
      'btn-open-score',
      'btn-new-score',
      'dropdown-export',
      'btn-select-all',
      'btn-delete',
      'link-help',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // One toolbar holds both the quick controls and the tools.
    await expect(row.getByTestId('btn-note-input')).toBeVisible();
    await expect(row.getByTestId('btn-delete')).toBeVisible();
    // Nothing scrolls sideways: the controls wrap instead.
    const overflow = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-testid="tool-strip-row"]')!;
      return {
        scroll: element.scrollWidth,
        client: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    expect(overflow.overflowX).toBe('visible');
    // Wrapped lines of buttons are not touching.
    const lineGaps = await page.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="tool-strip-row"] button'),
      ]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0);
      const tops = [...new Set(boxes.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      const bottoms = tops.map((t) =>
        Math.max(...boxes.filter((r) => Math.round(r.top) === t).map((r) => r.bottom)),
      );
      return tops.slice(1).map((t, i) => t - bottoms[i]);
    });
    for (const gap of lineGaps) expect(gap).toBeGreaterThanOrEqual(6);
    // Neighbouring buttons on a line are not touching either.
    const sideGaps = await page.evaluate(() => {
      // A split button's face and chevron are one control, deliberately joined.
      const boxes = [
        ...document.querySelectorAll<HTMLElement>('[data-testid="tool-strip-row"] button'),
      ]
        .map((b) => ({ rect: b.getBoundingClientRect(), pair: b.closest('[data-split-pair]') }))
        .filter((b) => b.rect.width > 0);
      const lines = new Map<number, typeof boxes>();
      for (const b of boxes) {
        const key = Math.round(b.rect.top);
        lines.set(key, [...(lines.get(key) ?? []), b]);
      }
      const gaps: number[] = [];
      for (const line of lines.values()) {
        const sorted = line.sort((a, b) => a.rect.left - b.rect.left);
        sorted.slice(1).forEach((b, i) => {
          const previous = sorted[i];
          if (b.pair && b.pair === previous.pair) return;
          gaps.push(b.rect.left - previous.rect.right);
        });
      }
      return gaps;
    });
    expect(sideGaps.length).toBeGreaterThan(10);
    for (const gap of sideGaps) expect(gap).toBeGreaterThanOrEqual(3);
    // The quick controls come before the tools.
    const quick = await page.getByTestId('btn-note-input').boundingBox();
    const tool = await page.getByTestId('btn-open-score').boundingBox();
    expect(tool!.y > quick!.y + quick!.height - 1 || tool!.x > quick!.x).toBe(true);
  }
});

test('hiding the tools leaves the quick controls', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-note-input')).toBeVisible();
  await expect(page.getByTestId('btn-delete')).toHaveCount(0);
});

test('Delete runs the engine command when something is selected', async ({ page }) => {
  await open(page, true);
  const count = await spyOnEngine(page, 'deleteSelection');
  await expect(page.getByTestId('btn-delete')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('btn-delete').click();
  await expect.poll(count).toBe(1);
});

test('Delete with nothing selected does nothing and says why', async ({ page }) => {
  await open(page, false);
  const count = await spyOnEngine(page, 'deleteSelection');
  const button = page.getByTestId('btn-delete');
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  // Playwright treats aria-disabled as not actionable; the point here is that a real click is inert.
  await button.click({ force: true });
  await page.waitForTimeout(300);
  expect(await count()).toBe(0);
  await expect(page.getByTestId('announcer')).toContainText('Delete: Select something first');
});

test('the selection filter menu lists its ten items as checkable, and stays open while toggling', async ({
  page,
}) => {
  await open(page, false);
  await page.getByTestId('dropdown-selection-filter').click();
  const menu = page.getByTestId('selection-filter-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemcheckbox')).toHaveCount(10);
  const voice1 = menu.getByTestId('selection-filter-1');
  const before = await voice1.getAttribute('aria-checked');
  await voice1.click();
  await expect(menu).toBeVisible();
  await expect(voice1).not.toHaveAttribute('aria-checked', before ?? 'true');
});

test('the export menu offers every format the ribbon did', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('dropdown-export').click();
  for (const id of [
    'btn-export-mscz',
    'btn-export-pdf',
    'btn-export-svg',
    'btn-export-png',
    'btn-export-mscx',
    'btn-export-musicxml',
    'btn-export-mxl',
    'btn-export-abc',
    'btn-export-midi',
    'btn-export-audio',
    'btn-export-current-page-audio',
    'btn-export-google-drive',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('strip controls hit-test to themselves', async ({ page }) => {
  await open(page, true);
  const result = await page.evaluate(() => {
    const bad: string[] = [];
    let seen = 0;
    for (const control of document.querySelectorAll<HTMLElement>(
      '[data-testid="tool-strip-row"] [data-strip-control]',
    )) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 || rect.right > innerWidth) continue;
      seen += 1;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!control.contains(hit)) bad.push(control.dataset.stripControl ?? '?');
    }
    return { bad, seen };
  });
  expect(result.seen).toBeGreaterThan(8);
  expect(result.bad).toEqual([]);
});

test('arrow keys walk the strip, and the strip is one tab stop', async ({ page }) => {
  await open(page, true);
  await page.getByTestId('btn-open-score').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('btn-new-score')).toBeFocused();
  await page.keyboard.press('End');
  // The last control of the last group (Notes, Marks, Text and Layout follow Home).
  await expect(page.getByTestId('dropdown-jumps')).toBeFocused();
  const tabStops = await page
    .locator('[data-testid="tool-strip-row"] [data-strip-control][tabindex="0"]')
    .count();
  expect(tabStops).toBe(1);
});

test('the strip can be hidden, and stays hidden after a reload', async ({ page }) => {
  await open(page, false);
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-delete')).toHaveCount(0);
  await expect(page.getByTestId('btn-note-input')).toBeVisible();
  await page.reload();
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect(page.getByTestId('tool-strip')).toHaveAttribute('data-collapsed', 'true');
  await page.getByTestId('btn-tool-strip-toggle').click();
  await expect(page.getByTestId('btn-delete')).toBeVisible();
});

test('the palette says why a command is unavailable (gate reasons reach the live editor)', async ({
  page,
}) => {
  await open(page, false);
  await page.keyboard.press('Control+Shift+P');
  await page.getByTestId('palette-input').fill('delete');
  const row = page
    .getByTestId('palette-row')
    .filter({ hasText: /^Delete/ })
    .first();
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row.getByTestId('palette-row-reason')).toHaveText('Select something first');
});

test.describe('Notes group', () => {
  test('Pitch up, Flip direction and Up an octave reach the engine for the selected note', async ({
    page,
  }) => {
    await open(page, true);
    for (const [testId, method] of [
      ['btn-pitch-up', 'pitchUp'],
      ['btn-flip-stem', 'flipStem'],
      ['btn-transpose-12', 'transpose'],
    ] as const) {
      const count = await spyOnEngine(page, method);
      await page.getByTestId(testId).click();
      await expect.poll(count, { message: testId }).toBeGreaterThanOrEqual(1);
    }
  });

  test('with nothing selected the pitch buttons do nothing and say what to select', async ({
    page,
  }) => {
    await open(page, false);
    const count = await spyOnEngine(page, 'pitchUp');
    await expect(page.getByTestId('btn-pitch-up')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('btn-pitch-up').click({ force: true });
    await page.waitForTimeout(300);
    expect(await count()).toBe(0);
    await expect(page.getByTestId('announcer')).toContainText('Pitch up: Select something first');
  });

  test('a Lines item adds that line: 8vb is ottava type 1', async ({ page }) => {
    await open(page, true);
    await page.evaluate(() => {
      const score = (
        window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
      ).__webmscore;
      const calls: unknown[][] = [];
      (window as unknown as Record<string, unknown>).__ottavaCalls = calls;
      const original = score.addOttava.bind(score);
      score.addOttava = (...args: unknown[]) => {
        calls.push(args);
        return original(...args);
      };
    });
    await page.getByTestId('dropdown-lines').click();
    await page.getByTestId('btn-ottava-1').click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __ottavaCalls: unknown[][] }).__ottavaCalls),
      )
      .toEqual([[1]]);
  });

  for (const [menu, content, expected, headings] of [
    ['dropdown-fretboards', 'fretboards-menu', 9, []],
    ['dropdown-beams', null, 6, []],
    ['dropdown-grace-notes', null, 7, []],
    ['dropdown-lines', 'lines-menu', 12, ['Ottava', 'Trill lines', 'Glissando']],
    ['dropdown-chord', 'chord-menu', 13, ['Arpeggio', 'Tremolo']],
  ] as const) {
    test(`${menu} lists every variant the ribbon had`, async ({ page }) => {
      // These menus act on the selection, so they are only open to a selected note.
      await open(page, true);
      await page.getByTestId(menu).click();
      // Inside the opened dropdown only: the menu bar's own items are menuitems too.
      const items = page.getByRole('menu').getByRole('menuitem');
      await expect(items).toHaveCount(expected);
      if (content) await expect(page.getByTestId(content)).toBeVisible();
      for (const heading of headings)
        await expect(page.getByRole('menu').getByText(heading, { exact: true })).toBeVisible();
    });
  }

  test('the transpose button opens the transpose dialog', async ({ page }) => {
    await open(page, true);
    await page.getByTestId('btn-transpose-dialog').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Marks group', () => {
  async function spyOnCalls(page: Page, method: string) {
    await page.evaluate((name) => {
      const score = (
        window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
      ).__webmscore;
      const calls: unknown[][] = [];
      (window as unknown as Record<string, unknown>).__markCalls = calls;
      const original = score[name].bind(score);
      score[name] = (...args: unknown[]) => {
        calls.push(args);
        return original(...args);
      };
    }, method);
    return () =>
      page.evaluate(() => (window as unknown as { __markCalls: unknown[][] }).__markCalls);
  }

  test('the dynamics button runs the first dynamic, then whichever you chose last, and remembers it', async ({
    page,
  }) => {
    await open(page, true);
    const calls = await spyOnCalls(page, 'addDynamic');
    const face = page.getByTestId('dropdown-markings-last');
    await expect(face).toHaveAccessibleName('Dynamics: p');
    await face.click();
    await expect.poll(calls).toEqual([[6]]);

    await page.getByTestId('dropdown-markings').click();
    await page.getByTestId('btn-dynamic-10').click(); // ff
    await expect.poll(calls).toEqual([[6], [10]]);
    await expect(face).toHaveAccessibleName('Dynamics: ff');
    await face.click();
    await expect.poll(calls).toEqual([[6], [10], [10]]);

    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await expect(page.getByTestId('dropdown-markings-last')).toHaveAccessibleName('Dynamics: ff');
  });

  test('the dynamics menu is a grid of every dynamic, with the palette link under it', async ({
    page,
  }) => {
    await open(page, true);
    await page.getByTestId('dropdown-markings').click();
    const menu = page.getByTestId('markings-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(31);
    await expect(menu.getByTestId('btn-dynamic-8')).toHaveAttribute('aria-label', 'mf');
    await page.getByTestId('btn-open-dynamics-palette').click();
    await expect(page.locator('[data-testid^="palette-item-dynamic-"]').first()).toBeVisible();
  });

  test('a hairpin item adds that hairpin: Decrescendo is type 1', async ({ page }) => {
    await open(page, true);
    const calls = await spyOnCalls(page, 'addHairpin');
    await page.getByTestId('dropdown-hairpins').click();
    await page.getByTestId('btn-hairpin-decresc').click();
    await expect.poll(calls).toEqual([[1]]);
  });

  for (const [menu, content, expected] of [
    ['dropdown-pedal', null, 5],
    ['dropdown-articulations', 'articulations-menu', 4],
    ['dropdown-fermata', null, 6],
    ['dropdown-breath', null, 10],
  ] as const) {
    test(`${menu} lists every variant the ribbon had`, async ({ page }) => {
      await open(page, true);
      await page.getByTestId(menu).click();
      await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(expected);
      if (content) await expect(page.getByTestId(content)).toBeVisible();
    });
  }

  test('an articulation button runs from the face and the choice is its own: Tenuto after Staccato', async ({
    page,
  }) => {
    await open(page, true);
    const calls = await spyOnCalls(page, 'addArticulation');
    await page.getByTestId('dropdown-articulations-last').click();
    await expect.poll(calls).toEqual([['articStaccatoAbove']]);
    await page.getByTestId('dropdown-articulations').click();
    await page.getByTestId('btn-artic-articTenutoAbove').click();
    await expect.poll(calls).toEqual([['articStaccatoAbove'], ['articTenutoAbove']]);
    // Fermatas are a separate button with its own memory.
    await expect(page.getByTestId('dropdown-fermata-last')).toHaveAccessibleName(
      'Fermatas: Fermata',
    );
  });

  test('with nothing selected the split face does nothing and says what to select', async ({
    page,
  }) => {
    await open(page, false);
    const calls = await spyOnCalls(page, 'addDynamic');
    const face = page.getByTestId('dropdown-markings-last');
    await expect(face).toHaveAttribute('aria-disabled', 'true');
    await face.click({ force: true });
    await page.waitForTimeout(300);
    expect(await calls()).toEqual([]);
    await expect(page.getByTestId('announcer')).toContainText('Select a note or rest first');
  });
});

test.describe('Text group', () => {
  test('the text menu lists all 18 text types under headings', async ({ page }) => {
    await open(page, true);
    await page.getByTestId('dropdown-text').click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(18);
    for (const heading of ['Score header', 'On the score', 'Harmony', 'Fingering and technique']) {
      await expect(menu.getByText(heading, { exact: true })).toBeVisible();
    }
  });

  test('Title asks for the text, as the ribbon did', async ({ page }) => {
    await open(page, true);
    await page.getByTestId('dropdown-text').click();
    await page.getByTestId('btn-text-title').click();
    await expect(page.getByTestId('prompt-dialog-input')).toBeVisible();
    await page.getByTestId('prompt-dialog').getByRole('button', { name: 'Cancel' }).click();
  });

  test('the tempo button asks for a BPM in a popover and puts that tempo in the score', async ({
    page,
  }) => {
    await open(page, true);
    const hasTempo = (bpm: number) =>
      page.evaluate(async (value) => {
        const score = (
          window as unknown as { __webmscore: { saveMsc: (f: string) => Promise<Uint8Array> } }
        ).__webmscore;
        const xml = new TextDecoder().decode(await score.saveMsc('mscx'));
        return xml.includes(`<sym>metNoteQuarterUp</sym> = ${value}`);
      }, bpm);
    await page.getByTestId('btn-tempo-open').click();
    await expect(page.getByTestId('input-tempo-bpm')).toHaveValue('120');
    await page.getByTestId('input-tempo-bpm').fill('93');
    await page.getByTestId('btn-tempo-apply').click();
    await expect(page.getByTestId('btn-tempo-open-form')).toBeHidden();
    await expect.poll(() => hasTempo(93), { timeout: 20_000 }).toBe(true);
  });

  test('tempo needs no selection (it goes at the start), so its popover opens with none', async ({
    page,
  }) => {
    await open(page, false);
    await page.getByTestId('btn-tempo-open').click();
    await expect(page.getByTestId('input-tempo-bpm')).toBeVisible();
  });
});

test.describe('Layout group', () => {
  const readXml = (page: Page) =>
    page.evaluate(async () => {
      const score = (
        window as unknown as { __webmscore: { saveMsc: (f: string) => Promise<Uint8Array> } }
      ).__webmscore;
      return new TextDecoder().decode(await score.saveMsc('mscx'));
    });
  const countOf = async (page: Page, pattern: RegExp) =>
    ((await readXml(page)).match(pattern) ?? []).length;
  const timeSigs = async (page: Page) =>
    [
      ...(await readXml(page)).matchAll(
        /<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/g,
      ),
    ].map((m) => `${m[1]}/${m[2]}`);

  test('the insert measures popover really adds the bars it was asked for', async ({ page }) => {
    await open(page, true);
    const before = await countOf(page, /<Measure[ >]/g);
    await page.getByTestId('btn-measures-open').click();
    await expect(page.getByTestId('input-measure-count')).toHaveValue('1');
    await page.getByTestId('input-measure-count').fill('2');
    await page.getByTestId('btn-insert-measures').click();
    await expect(page.getByTestId('btn-measures-open-form')).toBeHidden();
    await expect.poll(() => countOf(page, /<Measure[ >]/g), { timeout: 20_000 }).toBe(before + 2);
  });

  test('the pickup popover opens with its defaults', async ({ page }) => {
    await open(page, true);
    await page.getByTestId('btn-pickup-open').click();
    await expect(page.getByTestId('input-pickup-numerator')).toHaveValue('1');
    await expect(page.getByTestId('select-pickup-denominator')).toHaveValue('4');
  });

  test('new line and new page put breaks in the score', async ({ page }) => {
    await open(page, true);
    const before = await countOf(page, /<subtype>line<\/subtype>/g);
    await page.getByTestId('btn-new-line').click();
    await expect
      .poll(() => countOf(page, /<subtype>line<\/subtype>/g), { timeout: 20_000 })
      .toBe(before + 1);
    await page.getByTestId('btn-new-page').click();
    await expect
      .poll(() => countOf(page, /<subtype>page<\/subtype>/g), { timeout: 20_000 })
      .toBeGreaterThan(0);
  });

  test('with nothing selected the break and ambitus buttons do nothing and say what to select', async ({
    page,
  }) => {
    await open(page, false);
    const button = page.getByTestId('btn-new-line');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await button.click({ force: true });
    await expect(page.getByTestId('announcer')).toContainText('New line');
    expect(await countOf(page, /<subtype>line<\/subtype>/g)).toBe(0);
    await expect(page.getByTestId('btn-add-ambitus')).toHaveAttribute('aria-disabled', 'true');
  });

  test('the time signature menu lists the presets and a custom entry, and cut time changes the score', async ({
    page,
  }) => {
    await open(page, true);
    await page.getByTestId('dropdown-signature').click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(3);
    await page.getByTestId('btn-timesig-2-2').click();
    await expect.poll(() => timeSigs(page), { timeout: 20_000 }).toContain('2/2');
  });

  test('Custom opens the time signature form, and 3/8 reaches the score', async ({ page }) => {
    await open(page, true);
    await page.getByTestId('dropdown-signature').click();
    await page.getByTestId('btn-timesig-custom-open').click();
    await page.getByTestId('input-timesig-numerator').fill('3');
    await page.getByTestId('input-timesig-denominator').fill('8');
    await page.getByTestId('btn-timesig-custom').click();
    await expect.poll(() => timeSigs(page), { timeout: 20_000 }).toContain('3/8');
  });

  test('the key signature grid has all 15 keys and D major puts two sharps in the score', async ({
    page,
  }) => {
    await open(page, true);
    await page.getByTestId('dropdown-key').click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(15);
    await page.getByTestId('btn-keysig-2').click();
    await expect
      .poll(() => countOf(page, /<KeySig>\s*<accidental>2<\/accidental>/g), { timeout: 20_000 })
      .toBeGreaterThan(0);
  });

  test('the bulk tools menu is off with nothing selected and lists the four tools for a range', async ({
    page,
  }) => {
    await open(page, false);
    await expect(page.getByTestId('dropdown-bulk-tools')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('svg .Note').first().click();
    await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('dropdown-bulk-tools')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByTestId('dropdown-bulk-tools').click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(4);
  });
});

test.describe('Score group', () => {
  const calls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __scoreCalls: unknown[][] }).__scoreCalls);
  async function spyOn(page: Page, method: string) {
    await page.evaluate((name) => {
      const score = (
        window as unknown as { __webmscore: Record<string, (...a: unknown[]) => unknown> }
      ).__webmscore;
      const recorded: unknown[][] = [];
      (window as unknown as Record<string, unknown>).__scoreCalls = recorded;
      const original = score[name].bind(score);
      score[name] = (...args: unknown[]) => {
        recorded.push(args);
        return original(...args);
      };
    }, method);
    return () => calls(page);
  }
  const mscx = (page: Page) =>
    page.evaluate(async () => {
      const score = (
        window as unknown as { __webmscore: { saveMsc: (f: string) => Promise<Uint8Array> } }
      ).__webmscore;
      return new TextDecoder().decode(await score.saveMsc('mscx'));
    });

  test('the clef button runs Treble from its face, then the clef you chose last', async ({
    page,
  }) => {
    await open(page, true);
    const seen = await spyOn(page, 'setClef');
    const face = page.getByTestId('dropdown-clef-last');
    await expect(face).toHaveAccessibleName('Clefs: Treble');
    await face.click();
    await expect.poll(seen).toEqual([[0]]);
    await page.getByTestId('dropdown-clef').click();
    await page.getByTestId('btn-clef-20').click(); // Bass
    await expect.poll(seen).toEqual([[0], [20]]);
    await expect(face).toHaveAccessibleName('Clefs: Bass');
  });

  test('the clef menu is a grid of all 35 clefs with the palette link, which opens Clefs', async ({
    page,
  }) => {
    await open(page, true);
    await page.getByTestId('dropdown-clef').click();
    const menu = page.getByTestId('clef-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(36);
    await expect(menu.getByTestId('btn-clef-20')).toHaveAttribute('aria-label', 'Bass');
    await page.getByTestId('btn-open-clef-palette').click();
    await expect(page.locator('[data-testid^="palette-item-clef-"]').first()).toBeVisible();
  });

  test('the repeats menu lists start, end, counts, barlines and voltas under headings', async ({
    page,
  }) => {
    await open(page, true);
    await page.getByTestId('dropdown-repeats').click();
    const menu = page.getByTestId('repeats-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(15);
    for (const heading of ['Repeat', 'Repeat count', 'Barlines', 'Voltas']) {
      await expect(menu.getByText(heading, { exact: true })).toBeVisible();
    }
  });

  test('Start repeat, a Double barline and a 1st ending reach the score', async ({ page }) => {
    await open(page, true);
    const count = async (pattern: RegExp) => ((await mscx(page)).match(pattern) ?? []).length;
    await page.getByTestId('dropdown-repeats').click();
    await page.getByTestId('btn-repeat-start').click();
    await expect.poll(() => count(/<startRepeat\/>/g), { timeout: 20_000 }).toBeGreaterThan(0);

    await page.getByTestId('dropdown-repeats').click();
    await page.getByTestId('btn-barline-2').click();
    await expect.poll(() => count(/<subtype>double<\/subtype>/g), { timeout: 20_000 }).toBe(1);

    await page.getByTestId('dropdown-repeats').click();
    await page.getByTestId('btn-volta-1').click();
    await expect.poll(() => count(/<Volta>/g), { timeout: 20_000 }).toBeGreaterThan(0);
  });

  test('a marker and a jump reach the engine, and their footers open their own palettes', async ({
    page,
  }) => {
    await open(page, true);
    const marker = await spyOn(page, 'addMarker');
    await page.getByTestId('dropdown-navigation').click();
    await expect(page.getByTestId('navigation-menu').getByRole('menuitem')).toHaveCount(8);
    await page.getByTestId('btn-marker-2').click(); // Coda
    await expect.poll(marker).toEqual([[2]]);

    const jump = await spyOn(page, 'addJump');
    await page.getByTestId('dropdown-jumps').click();
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveCount(15);
    await page.getByTestId('btn-jump-1').click(); // D.C. al Fine
    await expect.poll(jump).toEqual([[1]]);

    await page.getByTestId('dropdown-navigation').click();
    await page.getByTestId('btn-open-markers-palette').click();
    await expect(page.locator('[data-testid^="palette-item-marker-"]').first()).toBeVisible();
    await page.getByTestId('dropdown-jumps').click();
    await page.getByTestId('btn-open-jumps-palette').click();
    await expect(page.locator('[data-testid^="palette-item-jump-"]').first()).toBeVisible();
  });

  test('with nothing selected the repeats, markers and jumps menus say what to select', async ({
    page,
  }) => {
    await open(page, false);
    for (const id of ['dropdown-repeats', 'dropdown-navigation', 'dropdown-jumps']) {
      await expect(page.getByTestId(id)).toHaveAttribute('aria-disabled', 'true');
    }
    await page.getByTestId('dropdown-repeats').click({ force: true });
    await expect(page.getByTestId('announcer')).toContainText('Repeats and barlines: Select');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('the Instruments button opens the instruments panel', async ({ page }) => {
    await open(page, false);
    await page.getByTestId('dropdown-instruments').click();
    await expect(page.getByTestId('instruments-panel')).toBeVisible();
  });
});

test.describe('View ▸ Toolbar', () => {
  const NOTES_GROUPS = ['notes-entry', 'notes-connect', 'notes-rhythm', 'notes-pitch'];
  async function openToolbarMenu(page: Page) {
    await page.getByTestId('menu-view').click();
    await page.getByTestId('menu-sub-toolbar').click();
  }

  test('hides a section, keeps the quick row, remembers it across a reload, and shows all again', async ({
    page,
  }) => {
    await open(page, false);
    for (const group of NOTES_GROUPS) {
      await expect(page.getByTestId(`strip-group-${group}`)).toBeVisible();
    }
    await openToolbarMenu(page);
    await expect(page.getByTestId('menu-item-view.toolbar.showAll')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const notes = page.getByTestId('menu-item-view.toolbar.section-"notes"');
    await expect(notes).toHaveAttribute('aria-checked', 'true');
    await notes.click();
    await expect(notes).toHaveAttribute('aria-checked', 'false');
    for (const group of NOTES_GROUPS) {
      await expect(page.getByTestId(`strip-group-${group}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('strip-group-marks-dynamics')).toBeVisible();
    await expect(page.getByTestId('btn-note-input')).toBeVisible();

    await page.reload();
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await expect(page.getByTestId('strip-group-notes-entry')).toHaveCount(0);
    await expect(page.getByTestId('strip-group-marks-dynamics')).toBeVisible();

    await openToolbarMenu(page);
    await page.getByTestId('menu-item-view.toolbar.showAll').click();
    await expect(page.getByTestId('strip-group-notes-entry')).toBeVisible();
  });

  test('arrow keys skip a hidden section', async ({ page }) => {
    await open(page, false);
    await openToolbarMenu(page);
    for (const section of ['notes', 'marks', 'text', 'layout', 'score']) {
      await page.getByTestId(`menu-item-view.toolbar.section-"${section}"`).click();
    }
    await page.keyboard.press('Escape');
    await page.getByTestId('btn-new-score').focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('link-help')).toBeFocused();
  });
});
