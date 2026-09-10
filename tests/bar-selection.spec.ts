import { expect, test } from 'playwright/test';

/**
 * Bar (range) selection geometry and keyboard extension.
 *
 * Two regressions this pins down:
 *
 *  1. A range selection reported one bounding box *per notehead*, so a selected bar
 *     looked like a list selection of its notes with no rectangle around the bar.
 *     Upstream MuseScore computes one rectangle per system spanning the staff range
 *     (src/notation/utilities/scorerangeutilities.cpp, ScoreRangeUtilities::boundingArea);
 *     that is now ported into _getSelectionBoundingBoxes.
 *
 *  2. ensureSelectionInWasm guarded on `selectionBoxes.length > 1` to avoid collapsing
 *     a rich selection back to a point. Once a range became a single rectangle that
 *     guard stopped holding, and the second Shift+Arrow collapsed the range to one
 *     note. The guard now asks the engine via isSelectionRange().
 *
 * Keyboard semantics follow desktop MuseScore's shortcuts.xml exactly:
 * Shift+Arrow = select-next/prev-chord, Ctrl+Shift+Arrow = select-next/prev-measure,
 * Shift+Up/Down = select-staff-above/below (what makes a range span staves).
 */

const SCORE = '/?score=/test_scores/four_measures.musicxml';

type Box = { page: number; x: number; y: number; width: number; height: number };
type MeasureRange = { startMeasureIndex: number; endMeasureIndex: number } | null;
type BarSelectionWindow = typeof window & {
  __webmscore: {
    getSelectionBoundingBoxes: () => Promise<Box[]>;
    selectionMeasureRange: () => Promise<MeasureRange>;
    isSelectionRange: () => Promise<boolean>;
  };
};

const boxes = (page: import('playwright/test').Page): Promise<Box[]> =>
  page.evaluate(async () => (window as BarSelectionWindow).__webmscore.getSelectionBoundingBoxes());

const measureRange = (page: import('playwright/test').Page) =>
  page.evaluate(async () => (window as BarSelectionWindow).__webmscore.selectionMeasureRange());

const isRange = (page: import('playwright/test').Page): Promise<boolean> =>
  page.evaluate(async () => (window as BarSelectionWindow).__webmscore.isSelectionRange());

/**
 * Clicks empty space inside bar 2 (right of its note, left of bar 3's note).
 *
 * Waits on the engine's own range state, not just the overlay: the click round-trips
 * through the worker, and pressing a key before the range lands makes the extension
 * act on a stale selection. Polling only on box count is not enough -- a stale
 * single-element selection also yields one box.
 */
/**
 * Clicks empty space between two noteheads until the engine reports a range there.
 *
 * The click is retried rather than merely polled for its result: the score can still
 * be re-booting when the notes first appear in the DOM (the loader aborts and
 * restarts), and a click in that window lands on nothing at all -- selectionMeasureRange
 * then reports null forever, because no selection was ever initiated. Re-selecting the
 * same bar is idempotent, so this absorbs boot timing without papering over a wrong
 * selection: the assertion on the resulting range is unchanged.
 *
 * `leftNote`/`rightNote` are indices into `svg .Note`; the click lands between them, at
 * the left note's vertical centre. Clicking a notehead itself would take the element
 * branch rather than the measure one.
 */
/**
 * Notes in reading order (top-to-bottom staff row, then left-to-right within the
 * row), independent of their DOM/SVG order.
 *
 * The engine redraws the SVG with highlightSelection=true after any element click,
 * and the just-selected note is promoted to the end of that markup for z-stacking.
 * `svg .Note >> nth(i)` is therefore only a stable proxy for "the i-th note in the
 * piece" until the first note-level click; after that its DOM position no longer
 * matches score position. Sorting by geometry instead of DOM order keeps `leftNote`/
 * `rightNote` indices meaningful across a selection change.
 */
async function orderedNoteBoxes(page: import('playwright/test').Page) {
  const notes = page.locator('svg .Note');
  const count = await notes.count();
  const raw: { x: number; y: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i++) {
    const box = await notes.nth(i).boundingBox();
    if (box) raw.push(box);
  }
  const byY = [...raw].sort((a, b) => a.y - b.y);
  const rows: (typeof raw)[] = [];
  for (const box of byY) {
    const row = rows.at(-1);
    // Compare against the previous note, not the row's first: a single staff line can
    // drift gradually in y across several notes (stem/accidental bbox differences), and
    // comparing against a fixed first-note reference lets that drift accumulate past the
    // threshold and falsely split one row into two.
    const prev = row?.at(-1);
    if (row && prev && Math.abs(box.y - prev.y) < prev.height * 1.5) {
      row.push(box);
    } else {
      rows.push([box]);
    }
  }
  return rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x));
}

async function selectBarBetween(
  page: import('playwright/test').Page,
  leftNote: number,
  rightNote: number,
  expected: { startMeasureIndex: number; endMeasureIndex: number },
) {
  await expect
    .poll(
      async () => {
        const ordered = await orderedNoteBoxes(page);
        const a = ordered[leftNote];
        const b = ordered[rightNote];
        if (!a || !b) return null;
        await page.mouse.click((a.x + a.width + b.x) / 2, a.y + a.height / 2);
        await page.waitForTimeout(400);
        return await measureRange(page);
      },
      { timeout: 30_000, intervals: [500, 1000, 1000, 2000] },
    )
    .toEqual(expected);

  await expect.poll(async () => (await boxes(page)).length, { timeout: 30_000 }).toBe(1);
}

const selectBar2 = (page: import('playwright/test').Page) =>
  selectBarBetween(page, 1, 2, { startMeasureIndex: 1, endMeasureIndex: 1 });

test.beforeEach(async ({ page }) => {
  await page.goto(SCORE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect
    .poll(async () => await page.locator('svg .Note').count(), { timeout: 30_000 })
    .toBe(4);
});

test('a selected bar produces one rectangle spanning the bar, not one per note', async ({
  page,
}) => {
  await selectBar2(page);

  const barBoxes = await boxes(page);
  // One rectangle for the single system, not one per notehead.
  expect(barBoxes).toHaveLength(1);
  expect(await measureRange(page)).toEqual({ startMeasureIndex: 1, endMeasureIndex: 1 });

  // It must be a bar-sized region, not a notehead-sized one. A notehead is a few
  // units wide and shorter than the staff; the bar rectangle spans the full staff
  // height plus padding.
  const [box] = barBoxes;
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(50);

  // And it should be wider than it is tall for a single bar of one staff.
  expect(box.width).toBeGreaterThan(box.height);
});

// Root cause (see docs/private/SELECTION_WORK_HANDOFF.md §3 for the original
// diagnosis): a stale scheduled overlay refresh from a *previous* element click could
// fire after a later bar click had already set the correct selection.
// refreshSelectionFromSvg schedules refreshSelectionOverlay via a double-RAF, guarded
// by selectionOverlayGenerationRef -- but the measure/bar-click path never bumped that
// ref, so the stale callback still matched and ran. It scraped the DOM for
// .selected/.note-selected markers, found none (backend-highlighted range selections
// don't add those classes), fell back to the old note index, failed to resolve a box,
// and wiped selectionBoxes/selectedElement entirely. Fixed by bumping
// selectionOverlayGenerationRef at the very start of every click, invalidating any
// refresh scheduled by an earlier click before it can clobber a newer selection.
test('a bar stays selectable, with its rectangle, after a note has been clicked', async ({
  page,
}) => {
  // Reported repro: the first empty-space click selects the bar, but once a note has
  // been clicked, later empty-space clicks either highlight the noteheads with no bar
  // rectangle or appear to select nothing.
  const overlay = page.getByTestId('selection-overlay');
  const overlayWidth = async () => (await overlay.first().boundingBox())?.width ?? 0;

  await selectBar2(page);
  await expect(overlay).toHaveCount(1);
  const barWidth = await overlayWidth();

  // Select a single note; its rectangle must be far smaller than a bar's.
  // Raw mouse click rather than locator.click(): the bar overlay sits over the notes
  // and Playwright's actionability check never settles, even though the overlay is
  // pointer-events:none.
  const note0 = await page.locator('svg .Note').first().boundingBox();
  expect(note0).not.toBeNull();
  if (!note0) return;
  await page.mouse.click(note0.x + note0.width / 2, note0.y + note0.height / 2);
  await expect
    .poll(
      async () =>
        await page.evaluate(async () =>
          (window as BarSelectionWindow).__webmscore.isSelectionRange(),
        ),
      { timeout: 30_000 },
    )
    .toBe(false);
  const noteWidth = await overlayWidth();
  expect(noteWidth).toBeLessThan(barWidth / 2);

  // Back to the bar: the rectangle must return, at bar size.
  await selectBar2(page);
  await expect(overlay).toHaveCount(1);
  expect(await overlayWidth()).toBeCloseTo(barWidth, 0);
});

test('Ctrl+Shift+Right extends the selection by a whole bar', async ({ page }) => {
  await selectBar2(page);
  const [before] = await boxes(page);

  await page.keyboard.press('Control+Shift+ArrowRight');

  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 1, endMeasureIndex: 2 });

  const after = await boxes(page);
  expect(after).toHaveLength(1);
  // Still one rectangle, now covering two bars: it grew rightward from the same origin.
  expect(after[0].x).toBeCloseTo(before.x, 1);
  expect(after[0].width).toBeGreaterThan(before.width * 1.5);
});

test('Shift+Down extends the rectangle across staves', async ({ page }) => {
  // Two-staff fixture; the single-staff one cannot exercise this at all.
  await page.goto('/?score=/test_scores/two_staves_four_bars.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect
    .poll(async () => await page.locator('svg .Note').count(), { timeout: 30_000 })
    .toBe(8);

  // Bar 2 of the top staff. Notes 0-3 are the upper staff, 4-7 the lower one.
  await selectBarBetween(page, 1, 2, { startMeasureIndex: 1, endMeasureIndex: 1 });

  const [oneStaff] = await boxes(page);

  // Desktop MuseScore: Shift+Down extends the range to the staff below. Before this
  // was bound it fell through to the pitch handlers and transposed the note instead.
  await page.keyboard.press('Shift+ArrowDown');

  await expect
    .poll(async () => (await boxes(page))[0]?.height, { timeout: 30_000 })
    .toBeGreaterThan(oneStaff.height * 1.5);

  const twoStaff = (await boxes(page))[0];
  // Still one rectangle for the system, now tall enough to cover both staves and the
  // gap between them, and horizontally unchanged.
  expect(await boxes(page)).toHaveLength(1);
  expect(twoStaff.x).toBeCloseTo(oneStaff.x, 1);
  expect(twoStaff.width).toBeCloseTo(oneStaff.width, 1);
  expect(twoStaff.y).toBeCloseTo(oneStaff.y, 1);
});

test('Shift+Click on another bar extends the range instead of replacing it', async ({ page }) => {
  await selectBar2(page);
  const [before] = await boxes(page);

  // Empty space inside bar 3: right of bar 3's note, left of bar 4's. Clicking a
  // notehead would take the element branch instead of the measure one.
  const notes = page.locator('svg .Note');
  const b3 = await notes.nth(2).boundingBox();
  const b4 = await notes.nth(3).boundingBox();
  expect(b3).not.toBeNull();
  expect(b4).not.toBeNull();
  if (!b3 || !b4) return;
  await page.keyboard.down('Shift');
  await page.mouse.click((b3.x + b3.width + b4.x) / 2, b3.y + b3.height / 2);
  await page.keyboard.up('Shift');

  // Upstream maps Shift+Click to SelectType::RANGE, so the selection should now run
  // from bar 2 through bar 3 rather than jumping to bar 3 alone.
  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 1, endMeasureIndex: 2 });

  const after = await boxes(page);
  expect(after).toHaveLength(1);
  expect(after[0].x).toBeCloseTo(before.x, 1);
  expect(after[0].width).toBeGreaterThan(before.width * 1.5);
});

test('Shift+Click on a lower staff widens the rectangle across staves', async ({ page }) => {
  await page.goto('/?score=/test_scores/two_staves_four_bars.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await expect
    .poll(async () => await page.locator('svg .Note').count(), { timeout: 30_000 })
    .toBe(8);

  // Bar 2 of the top staff. Notes 0-3 are the upper staff, 4-7 the lower one.
  await selectBarBetween(page, 1, 2, { startMeasureIndex: 1, endMeasureIndex: 1 });
  const [oneStaff] = await boxes(page);

  const notes = page.locator('svg .Note');
  const lower = await notes.nth(5).boundingBox();
  const lowerNext = await notes.nth(6).boundingBox();
  expect(lower).not.toBeNull();
  expect(lowerNext).not.toBeNull();
  if (!lower || !lowerNext) return;

  await page.keyboard.down('Shift');
  await page.mouse.click((lower.x + lower.width + lowerNext.x) / 2, lower.y + lower.height / 2);
  await page.keyboard.up('Shift');

  await expect
    .poll(async () => (await boxes(page))[0]?.height, { timeout: 30_000 })
    .toBeGreaterThan(oneStaff.height * 1.5);

  const twoStaff = (await boxes(page))[0];
  expect(await boxes(page)).toHaveLength(1);
  expect(twoStaff.y).toBeCloseTo(oneStaff.y, 1);
});

// KNOWN FAILING, ~50% of runs. Not a flaky test -- a flaky product: bar selection
// races once other selection state exists. The engine's bounding boxes and
// refreshSelectionFromSvg's `.selected` scrape are two independent sources of
// selectionBoxes, and the empty-click path deliberately skips the SVG refresh while
// other call sites do not. Re-enable (drop .fixme) once that is resolved; the
// assertions themselves are correct and did catch the isSelectionRange regression.
test('repeated Shift+Right keeps extending instead of collapsing the range', async ({ page }) => {
  await selectBar2(page);

  // Each bar holds a single whole note, so one chord-step is also one bar here.
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 1, endMeasureIndex: 2 });

  // The regression: this second press used to collapse the range back to bar 2 and
  // render a sliver box, because the single-rectangle range failed the old
  // `selectionBoxes.length > 1` guard and got re-projected from a point.
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 1, endMeasureIndex: 3 });

  const after = await boxes(page);
  expect(after).toHaveLength(1);
  expect(after[0].width).toBeGreaterThan(100);
});

// Design: docs/private/SELECTION_WORK_HANDOFF.md open item #2. Upstream MuseScore's
// Ctrl+Click on empty bar space (Score::selectAdd, score.cpp:2984) never builds a list
// selection of bars -- it replaces the range with the newly clicked bar, or, when
// re-clicking the bar that is already the sole selection, deselects it
// (NotationInteraction::doSelect). There is no discontiguous "add this bar too" to
// port: measure deletion (cmdTimeDelete) requires a RANGE and refuses a List outright
// upstream too. So Ctrl+Click only needs to add the toggle-off case on top of the
// default replace-click OTS_Web already does.
test('Ctrl+Click toggles the already-selected bar off, and replaces a different one', async ({
  page,
}) => {
  await selectBar2(page);

  const ctrlClickBetween = async (leftNote: number, rightNote: number) => {
    const ordered = await orderedNoteBoxes(page);
    const a = ordered[leftNote];
    const b = ordered[rightNote];
    await page.keyboard.down('Control');
    await page.mouse.click((a.x + a.width + b.x) / 2, a.y + a.height / 2);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
  };

  // Ctrl+Click the bar that is already selected: toggles off, nothing selected.
  await ctrlClickBetween(1, 2);
  await expect.poll(async () => await measureRange(page), { timeout: 30_000 }).toBeNull();
  await expect.poll(async () => (await boxes(page)).length, { timeout: 30_000 }).toBe(0);

  // Ctrl+Click the same bar again with nothing selected: selects it fresh.
  await ctrlClickBetween(1, 2);
  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 1, endMeasureIndex: 1 });

  // Ctrl+Click a different bar: replaces the selection, does not extend or list it.
  await ctrlClickBetween(2, 3);
  await expect
    .poll(async () => await measureRange(page), { timeout: 30_000 })
    .toEqual({ startMeasureIndex: 2, endMeasureIndex: 2 });
  await expect.poll(async () => (await boxes(page)).length, { timeout: 30_000 }).toBe(1);
});

// The single-staff, near-whole-note fixtures above render and hit-test fast enough
// that they never exercise the actual race: renderScore() (a WASM saveSvg() round
// trip) is slow enough on a real, dense score that a later click can complete while
// an earlier click's own selection-refresh is still in flight. Reproduced against
// bach_orig.mscz (320 notes on the first page alone) and NOT against the fixtures
// above -- this is the regression test for that gap.
//
// Two distinct bugs showed up here, both in docs/private/SELECTION_WORK_HANDOFF.md §3:
//
//  1. refreshSelectionFromSvg captured its generation *after* awaiting renderScore(),
//     not before. A later click's generation bump (handleScoreClick) could land
//     while that render was in flight; when it resolved, capturing "now" re-minted a
//     stale refresh as current, which then wiped the newer bar selection entirely.
//     Fixed by capturing before the render and bailing out if superseded by the time
//     it resolves.
//
//  2. Even with (1) fixed, primarySelectionRect still preferred selectedElement over
//     the engine-provided range box. The measure/bar path never touches
//     selectedElement, so it stayed pointed at whatever note was selected before --
//     the *native* SVG highlight (saveSvg with highlightSelection=true) was correct,
//     but the React overlay div stayed note-sized. Fixed by preferring the range box
//     whenever hasBackendHighlighting is set, a pure render-time change matching
//     "Fix 2" from the original diagnosis -- shelved back then because bug (1) was
//     still live and made it look ineffective.
test('a bar stays selectable, with its rectangle, after a note click in a dense real score', async ({
  page,
}) => {
  // At the default test viewport this score renders small enough that clicks land
  // ambiguously between crowded noteheads; a larger viewport gives the hit-testing
  // enough room to be unambiguous. Unrelated to the bug under test.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 90_000 });

  // Wide pitch range (arpeggiated figuration) means adjacent notes in time can sit
  // far apart in y, so a click point derived from note geometry alone can miss the
  // staff. Click at the staff's own mid-height instead, and only ever pick notes
  // that fall within that staff line's vertical band, so leftover notes from other
  // systems can't sneak into the ordering.
  const staffBox = await page.locator('svg .StaffLines').first().boundingBox();
  if (!staffBox) throw new Error('no .StaffLines found');
  const staffMidY = staffBox.y + staffBox.height / 2;

  const notesOnStaff = async () => {
    const locators = page.locator('svg .Note');
    const count = await locators.count();
    const out: { x: number; width: number }[] = [];
    for (let i = 0; i < count; i++) {
      const box = await locators.nth(i).boundingBox();
      if (!box) continue;
      if (
        box.y + box.height >= staffBox.y - staffBox.height &&
        box.y <= staffBox.y + staffBox.height * 2
      ) {
        out.push({ x: box.x, width: box.width });
      }
    }
    return out.sort((a, b) => a.x - b.x);
  };

  await expect
    .poll(async () => (await notesOnStaff()).length, { timeout: 30_000 })
    .toBeGreaterThan(7);

  // Retries, not a single click: the loader can still be aborting and restarting
  // when notes first appear (docs/private/SELECTION_WORK_HANDOFF.md §4), and a click
  // in that window lands on nothing. Re-clicking the same spot is idempotent once
  // the score has actually settled.
  const clickBetweenUntilRange = async (leftIndex: number, rightIndex: number) => {
    await expect
      .poll(
        async () => {
          const notes = await notesOnStaff();
          const a = notes[leftIndex];
          const b = notes[rightIndex];
          if (!a || !b) return false;
          await page.mouse.click((a.x + a.width + b.x) / 2, staffMidY);
          await page.waitForTimeout(500);
          return await isRange(page);
        },
        { timeout: 30_000, intervals: [500, 1000, 1000, 2000] },
      )
      .toBe(true);
  };

  const overlay = page.getByTestId('selection-overlay');
  const overlayWidth = async () => (await overlay.first().boundingBox())?.width ?? 0;

  await clickBetweenUntilRange(0, 1);
  await expect(overlay).toHaveCount(1);
  const barWidth = await overlayWidth();
  expect(barWidth).toBeGreaterThan(20);

  const note = page.locator('svg .Note').nth(2);
  const noteBox = await note.boundingBox();
  if (!noteBox) throw new Error('no note to click');
  await page.mouse.click(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await expect.poll(async () => await isRange(page), { timeout: 30_000 }).toBe(false);

  // A bar that was never selected before -- not a re-click, so this can't be
  // mistaken for the Ctrl+Click toggle-off case above.
  await clickBetweenUntilRange(6, 7);
  await expect(overlay).toHaveCount(1);
  // Bar-sized, not note-sized: a stale selectedElement rendered a handful of px wide.
  expect(await overlayWidth()).toBeGreaterThan(barWidth / 2);
});

// A range spanning multiple systems gets one bounding box per system from the engine
// (ScoreRangeUtilities::boundingArea upstream, ported into _getSelectionBoundingBoxes --
// see the file header). The overlay used to render exactly one rectangle no matter what:
// primarySelectionRect only ever resolved a single box, and the only other render path
// was explicitly gated `!hasBackendHighlighting`, so a backend-highlighted range with
// more than one box hit neither path and drew nothing past the first system. The four
// single-system fixtures above can't reach this at all.
test('a range spanning multiple systems draws one rectangle per system', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.waitForSelector('svg .Note', { timeout: 90_000 });

  const staffBox = await page.locator('svg .StaffLines').first().boundingBox();
  if (!staffBox) throw new Error('no .StaffLines found');
  const staffMidY = staffBox.y + staffBox.height / 2;

  const notesOnFirstStaff = async () => {
    const locators = page.locator('svg .Note');
    const count = await locators.count();
    const out: { x: number; width: number }[] = [];
    for (let i = 0; i < count; i++) {
      const box = await locators.nth(i).boundingBox();
      if (!box) continue;
      if (
        box.y + box.height >= staffBox.y - staffBox.height &&
        box.y <= staffBox.y + staffBox.height * 2
      ) {
        out.push({ x: box.x, width: box.width });
      }
    }
    return out.sort((a, b) => a.x - b.x);
  };

  await expect
    .poll(async () => (await notesOnFirstStaff()).length, { timeout: 30_000 })
    .toBeGreaterThan(1);

  await expect
    .poll(
      async () => {
        const notes = await notesOnFirstStaff();
        const a = notes[0];
        const b = notes[1];
        if (!a || !b) return false;
        await page.mouse.click((a.x + a.width + b.x) / 2, staffMidY);
        await page.waitForTimeout(500);
        return await isRange(page);
      },
      { timeout: 30_000, intervals: [500, 1000, 1000, 2000] },
    )
    .toBe(true);

  // Extend by whole bars until the range crosses into a second system -- the engine
  // reports one box per system, so this is the signal to stop.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Control+Shift+ArrowRight');
        await page.waitForTimeout(500);
        return (await boxes(page)).length;
      },
      { timeout: 30_000, intervals: [500, 500, 500, 1000] },
    )
    .toBeGreaterThan(1);

  const engineBoxes = await boxes(page);
  expect(engineBoxes.length).toBeGreaterThan(1);

  const overlay = page.getByTestId('selection-overlay');
  await expect(overlay).toHaveCount(engineBoxes.length);

  // Each rectangle sits on its own system: distinct y, all bar-sized.
  const ys = new Set<number>();
  for (let i = 0; i < engineBoxes.length; i++) {
    const box = await overlay.nth(i).boundingBox();
    if (!box) throw new Error(`overlay ${i} has no box`);
    expect(box.width).toBeGreaterThan(20);
    ys.add(Math.round(box.y));
  }
  expect(ys.size).toBe(engineBoxes.length);
});
