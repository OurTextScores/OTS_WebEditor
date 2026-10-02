import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * Embed Mode Tests
 *
 * Tests the external XML comparison embed mode functionality that allows
 * loading two XML files via URL parameters and displaying only the compare view.
 *
 * Tests use local sample files from public/sample-left.xml and public/sample-right.xml
 */

test.describe('Embed Mode - External XML Comparison', () => {
  // Use local sample files served from public directory
  const leftXmlUrl = '/sample-left.xml';
  const rightXmlUrl = '/sample-right.xml';

  // For mocked external URL tests
  const testXmlRight = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

  test('should detect embed mode when compareLeft and compareRight params are present', async ({
    page,
  }) => {
    // Navigate with embed mode parameters using local files
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );

    // Wait for loading to complete
    await page.waitForTimeout(3000);

    // Verify compare modal is visible
    await expect(page.getByTestId('checkpoint-compare-modal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Swap sides/i })).toHaveCount(0);
  });

  test('should hide toolbar in embed mode', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(3000);

    // Toolbar should not be visible in embed mode
    const toolbar = page.locator('div').filter({ has: page.getByText('New Score') });
    await expect(toolbar).not.toBeVisible();
    await expect(page.getByTestId('shell-header')).toHaveCount(0);
  });

  test('should hide checkpoint sidebar in embed mode', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(3000);

    // Checkpoint sidebar should not be visible
    await expect(page.getByTestId('checkpoint-sidebar')).not.toBeVisible();
  });

  test('should hide save checkpoint buttons in embed mode', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(3000);

    // Save checkpoint buttons should not be visible
    const saveButtons = page.getByText('💾 Save checkpoint');
    await expect(saveButtons.first()).not.toBeVisible();
  });

  test('should hide overwrite arrows in embed mode', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(5000);

    // Overwrite arrow buttons should not be visible in embed mode
    const overwriteButtons = page.getByRole('button', { name: /Overwrite/ });
    await expect(overwriteButtons.first()).not.toBeVisible();
  });

  test('should use custom labels from URL parameters', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`,
    );
    await page.waitForTimeout(3000);

    // exact:true so these do not also match XmlDiffView's
    // "MusicXML Diff (Version 1 -> Version 2)" summary, which contains both labels.
    await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  });

  test('should use default labels when not specified', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(3000);

    // exact:true so these do not also match XmlDiffView's
    // "MusicXML Diff (Left -> Right)" summary, which contains both labels.
    await expect(page.getByText('Left', { exact: true })).toBeVisible();
    await expect(page.getByText('Right', { exact: true })).toBeVisible();
  });

  test('should show loading state while fetching external files', async ({ page }) => {
    // Serve the fixtures from the test process instead of proxying to the dev server.
    // route.continue() made this depend on dev-server latency, and a slow response was
    // surfacing as "Failed to fetch files" -- the error state, not the loading state.
    const bodyFor = (url: string) =>
      readFileSync(resolve(process.cwd(), 'public', url.replace(/^\//, '')), 'utf8');
    const holdMs = 4000;
    for (const url of [leftXmlUrl, rightXmlUrl]) {
      await page.route(url, async (route) => {
        await new Promise((done) => setTimeout(done, holdMs));
        await route.fulfill({
          status: 200,
          contentType: 'application/xml',
          body: bodyFor(url),
        });
      });
    }

    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );

    // The hold is long enough that the loading state is still up even when hydration
    // is slow, so this no longer races a 1s budget against a 1s delay.
    const loading = page.getByText('Loading comparison...');
    await expect(loading).toBeVisible({ timeout: holdMs });

    // Wait on the observable transition rather than sleeping past it.
    await expect(loading).toBeHidden({ timeout: 30_000 });
  });

  test('should handle fetch errors gracefully', async ({ page }) => {
    // Mock a failed request
    await page.route('https://example.com/left.xml', async (route) => {
      await route.fulfill({ status: 404, body: 'Not Found' });
    });

    await page.route('https://example.com/right.xml', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/xml', body: testXmlRight });
    });

    await page.goto(
      '/?compareLeft=https://example.com/left.xml&compareRight=https://example.com/right.xml',
    );
    // The failure reaches the reader as a notice, not a modal alert.
    await expect(page.getByTestId('notice-error').first()).toContainText('Failed to load files', {
      timeout: 15_000,
    });
  });

  test('should not activate embed mode with only one URL parameter', async ({ page }) => {
    await page.goto(`/?compareLeft=${encodeURIComponent(leftXmlUrl)}`);
    await page.waitForTimeout(1000);

    // The full editor shows the shell header (the ribbon's New Score button moved into the
    // File menu), and no embed surface does.
    await expect(page.getByTestId('shell-header')).toBeVisible();

    // Compare modal should not be visible
    const compareModal = page.getByTestId('checkpoint-compare-modal');
    await expect(compareModal).not.toBeVisible();
  });

  test('should display compare panes with loaded scores', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}`,
    );
    await page.waitForTimeout(5000);

    // Both panes should be visible
    const leftPane = page.getByTestId('compare-pane-left');
    const rightPane = page.getByTestId('compare-pane-right');

    await expect(leftPane).toBeVisible();
    await expect(rightPane).toBeVisible();

    // Panes should contain SVG elements (rendered scores)
    await expect(leftPane.locator('svg').first()).toBeVisible({ timeout: 10000 });
    await expect(rightPane.locator('svg').first()).toBeVisible({ timeout: 10000 });
  });

  test('should show "Open in Editor" buttons in embed mode', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Left&rightLabel=Right`,
    );
    await page.waitForTimeout(3000);

    // Open in Editor buttons should be visible
    const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
    await expect(openInEditorButtons.first()).toBeVisible();
    await expect(openInEditorButtons.nth(1)).toBeVisible();
  });

  test('should edit either compare pane and route shortcuts to the active score', async ({
    page,
  }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent('/sample-left.xml')}&compareRight=${encodeURIComponent('/sample-right.xml')}&leftLabel=Left&rightLabel=Right`,
    );
    await expect(page.getByTestId('compare-pane-left').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('compare-pane-right').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId('btn-compare-activate-left').click();
    await expect(page.getByTestId('btn-compare-activate-left')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const leftNote = page.getByTestId('compare-pane-left').locator('svg .Note').first();
    let leftNoteBox: Awaited<ReturnType<typeof leftNote.boundingBox>> = null;
    await expect
      .poll(
        async () => {
          leftNoteBox = await leftNote.boundingBox();
          return leftNoteBox?.width ?? 0;
        },
        {
          timeout: 30000,
        },
      )
      .toBeGreaterThan(0);
    const renderedLeftNoteBox = leftNoteBox as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    expect(renderedLeftNoteBox).not.toBeNull();
    if (!renderedLeftNoteBox) {
      throw new Error('Expected the left compare score to render a clickable note.');
    }
    await page.mouse.click(
      renderedLeftNoteBox.x + renderedLeftNoteBox.width / 2,
      renderedLeftNoteBox.y + renderedLeftNoteBox.height / 2,
    );
    await expect(page.getByTestId('compare-selection-overlay-left').first()).toBeVisible();
    await expect(page.getByTestId('compare-selection-overlay-right')).toHaveCount(0);
    const selectedNoteCount = () =>
      page
        .getByTestId('compare-pane-left')
        .locator('svg .Note')
        .evaluateAll(
          (notes) =>
            notes.filter((note) => getComputedStyle(note).fill === 'rgb(0, 101, 191)').length,
        );
    await expect.poll(selectedNoteCount).toBe(1);
    const finishAnnotationButton = page.getByRole('button', { name: 'Done' });
    if (await finishAnnotationButton.isVisible()) {
      await finishAnnotationButton.click();
    }

    // Navigation must continue to use the engine selection after a pitch mutation
    // rerenders the active compare score.
    const selectionOverlay = page.getByTestId('compare-selection-overlay-left').first();
    const firstSelectionBox = await selectionOverlay.boundingBox();
    if (!firstSelectionBox) {
      throw new Error('Expected the first compare selection to be measurable.');
    }
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await selectionOverlay.boundingBox())?.x ?? 0, {
        timeout: 20000,
      })
      .toBeGreaterThan(firstSelectionBox.x);
    const secondSelectionBox = await selectionOverlay.boundingBox();
    if (!secondSelectionBox) {
      throw new Error('Expected the second compare selection to be measurable.');
    }
    await page.keyboard.press('ArrowUp');
    await expect.poll(selectedNoteCount, { timeout: 20000 }).toBe(1);
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await selectionOverlay.boundingBox())?.x ?? 0, {
        timeout: 20000,
      })
      .toBeGreaterThan(secondSelectionBox.x);
    const thirdSelectionBox = await selectionOverlay.boundingBox();
    if (!thirdSelectionBox) {
      throw new Error('Expected the third compare selection to be measurable.');
    }
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await selectionOverlay.boundingBox())?.x ?? Number.POSITIVE_INFINITY, {
        timeout: 20000,
      })
      .toBeLessThan(thirdSelectionBox.x);

    const zoomValue = page.getByTestId('compare-zoom-value-left');
    const wrapper = page.getByTestId('compare-score-wrapper-left');
    const initialZoom = Number.parseInt((await zoomValue.textContent()) ?? '', 10);
    const initialWrapperWidth = (await wrapper.boundingBox())?.width ?? 0;
    await page.getByTestId('btn-compare-zoom-in-left').click();
    await expect(zoomValue).toHaveText(`${initialZoom + 10}%`);
    await expect
      .poll(async () => (await wrapper.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialWrapperWidth);
    // Auto-fit remains active for container resizes, but must not overwrite a
    // zoom chosen by the user or rerender away the engine's selected-note color.
    await page.waitForTimeout(750);
    await expect(zoomValue).toHaveText(`${initialZoom + 10}%`);
    await expect.poll(selectedNoteCount).toBe(1);
    await page.getByTestId('btn-compare-add-bar-left').click();

    await page.evaluate(() => {
      window.open = () => null;
    });
    await page
      .getByRole('button', { name: /Open in Editor/ })
      .first()
      .click();
    await expect
      .poll(async () =>
        page.evaluate(() => JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || ''),
      )
      .toContain('measure number="2"');

    await page.getByTestId('btn-compare-activate-right').click();
    await page.keyboard.press('n');
    await expect(page.getByTestId('btn-compare-note-input-right')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('btn-compare-note-input-left')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Note-input pitch entry must not depend on a prior click-selection.
    await page.keyboard.press('c');
    await page
      .getByRole('button', { name: /Open in Editor/ })
      .nth(1)
      .click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const xml = JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || '';
          return (xml.match(/<note(?:\s|>)/g) || []).length;
        }),
      )
      .toBeGreaterThan(1);

    await page.getByTestId('btn-compare-palettes-right').click();
    await expect(page.getByTestId('floating-palettes')).toBeVisible();
  });

  test('copies and pastes selections between both compare scores', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent('/sample-left.xml')}&compareRight=${encodeURIComponent('/sample-right.xml')}&leftLabel=Left&rightLabel=Right`,
    );
    await expect(page.getByTestId('compare-pane-left').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('compare-pane-right').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('compare-pane-left').locator('svg .Note').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('compare-pane-right').locator('svg .Note').first()).toBeVisible({
      timeout: 30000,
    });
    await page.evaluate(() => {
      window.open = () => null;
    });

    const openButtons = page.getByRole('button', { name: /Open in Editor/ });
    const readPaneXml = async (index: number) => {
      await openButtons.nth(index).click();
      return page.evaluate(
        () => JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || '',
      );
    };
    const pitches = (xml: string) =>
      [...xml.matchAll(/<step>([A-G])<\/step>/g)].map((match) => match[1]);
    const selectedIndexBySide: Record<'left' | 'right', number | null> = {
      left: null,
      right: null,
    };
    const selectNote = async (side: 'left' | 'right', noteIndex: number) => {
      await page.getByTestId(`btn-compare-activate-${side}`).click();
      // SVG .Note groups can include stems/flags outside the notehead, so the
      // geometric centre of an arbitrary nth group is not necessarily an engine
      // hit point. Click the known-selectable first note once per score, then let
      // libmscore own navigation and preserve that role-owned selection.
      const note = page.getByTestId(`compare-pane-${side}`).locator('svg .Note').first();
      const selectionOverlay = page.getByTestId(`compare-selection-overlay-${side}`).first();
      if (selectedIndexBySide[side] === null) {
        let noteBox: Awaited<ReturnType<typeof note.boundingBox>> = null;
        await expect
          .poll(
            async () => {
              noteBox = await note.boundingBox();
              return noteBox?.width ?? 0;
            },
            { timeout: 30000 },
          )
          .toBeGreaterThan(0);
        const renderedNoteBox = noteBox as {
          x: number;
          y: number;
          width: number;
          height: number;
        } | null;
        if (!renderedNoteBox) {
          throw new Error(`Expected a clickable note in the ${side} compare score.`);
        }
        await page.mouse.click(
          renderedNoteBox.x + renderedNoteBox.width / 2,
          renderedNoteBox.y + renderedNoteBox.height / 2,
        );
        await expect(selectionOverlay).toBeVisible();
        const finishAnnotationButton = page.getByRole('button', { name: 'Done' });
        if (await finishAnnotationButton.isVisible()) {
          await finishAnnotationButton.click();
        }
        selectedIndexBySide[side] = 0;
      } else {
        await expect(selectionOverlay).toBeVisible();
      }
      const currentIndex = selectedIndexBySide[side] ?? 0;
      const direction = noteIndex >= currentIndex ? 'ArrowRight' : 'ArrowLeft';
      const distance = Math.abs(noteIndex - currentIndex);
      if (distance > 0) {
        let previousSelectionBox = await selectionOverlay.boundingBox();
        for (let index = 0; index < distance; index += 1) {
          await page.keyboard.press(direction);
          await expect
            .poll(
              async () => {
                const nextSelectionBox = await selectionOverlay.boundingBox();
                return Boolean(
                  previousSelectionBox &&
                  nextSelectionBox &&
                  (nextSelectionBox.x !== previousSelectionBox.x ||
                    nextSelectionBox.y !== previousSelectionBox.y),
                );
              },
              { timeout: 20000 },
            )
            .toBe(true);
          previousSelectionBox = await selectionOverlay.boundingBox();
        }
      }
      selectedIndexBySide[side] = noteIndex;
    };
    await selectNote('left', 1);
    await page.keyboard.press('Control+C');
    await selectNote('right', 0);
    await page.keyboard.press('Control+V');
    await expect
      .poll(async () => pitches(await readPaneXml(1))[0], {
        timeout: 30000,
      })
      .toBe('D');

    await selectNote('right', 2);
    await page.keyboard.press('Control+C');
    await selectNote('left', 0);
    await page.keyboard.press('Control+V');
    await expect
      .poll(async () => pitches(await readPaneXml(0))[0], {
        timeout: 30000,
      })
      .toBe('G');

    const leftXml = await readPaneXml(0);
    const rightXml = await readPaneXml(1);
    expect(pitches(leftXml).slice(0, 4)).toEqual(['G', 'D', 'E', 'F']);
    expect(pitches(rightXml).slice(0, 4)).toEqual(['D', 'E', 'G', 'C']);
  });

  test('shows and toggles the engine note-input cursor in both compare panes', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent('/sample-left.xml')}&compareRight=${encodeURIComponent('/sample-right.xml')}&leftLabel=Left&rightLabel=Right`,
    );
    await expect(page.getByTestId('compare-pane-left').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('compare-pane-right').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });

    const leftButton = page.getByTestId('btn-compare-note-input-left');
    const rightButton = page.getByTestId('btn-compare-note-input-right');
    await expect(leftButton).toBeEnabled();
    await expect(rightButton).toBeEnabled();

    await leftButton.click();
    await expect(leftButton).toHaveAttribute('aria-pressed', 'true');
    await expect(leftButton).toHaveText('Stop input');
    await expect(page.getByTestId('compare-note-input-cursor-left')).toBeVisible();
    await expect(page.getByTestId('compare-note-input-cursor-right')).toHaveCount(0);

    await rightButton.click();
    await expect(rightButton).toHaveAttribute('aria-pressed', 'true');
    await expect(rightButton).toHaveText('Stop input');
    await expect(leftButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('compare-note-input-cursor-left')).toBeVisible();
    await expect(page.getByTestId('compare-note-input-cursor-right')).toBeVisible();

    await leftButton.click();
    await expect(leftButton).toHaveAttribute('aria-pressed', 'false');
    await expect(leftButton).toHaveText('Note input');
    await expect(page.getByTestId('compare-note-input-cursor-left')).toHaveCount(0);
    await expect(page.getByTestId('compare-note-input-cursor-right')).toBeVisible();

    await rightButton.click();
    await expect(rightButton).toHaveAttribute('aria-pressed', 'false');
    await expect(rightButton).toHaveText('Note input');
    await expect(page.getByTestId('compare-note-input-cursor-right')).toHaveCount(0);
  });

  test('queues burst note input without re-editing the first note', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent('/sample-left.xml')}&compareRight=${encodeURIComponent('/sample-right.xml')}&leftLabel=Left&rightLabel=Right`,
    );
    await expect(page.getByTestId('compare-pane-left').locator('svg').first()).toBeVisible({
      timeout: 30000,
    });

    await page.getByTestId('btn-compare-activate-left').click();
    const firstNote = page.getByTestId('compare-pane-left').locator('svg .Note').first();
    let firstNoteBox: Awaited<ReturnType<typeof firstNote.boundingBox>> = null;
    await expect
      .poll(
        async () => {
          firstNoteBox = await firstNote.boundingBox();
          return firstNoteBox?.width ?? 0;
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
    const renderedFirstNoteBox = firstNoteBox as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    expect(renderedFirstNoteBox).not.toBeNull();
    if (!renderedFirstNoteBox) {
      throw new Error('Expected the left compare score to render a clickable note.');
    }
    await page.mouse.click(
      renderedFirstNoteBox.x + renderedFirstNoteBox.width / 2,
      renderedFirstNoteBox.y + renderedFirstNoteBox.height / 2,
    );
    await expect(page.getByTestId('compare-selection-overlay-left').first()).toBeVisible();

    await page.getByTestId('btn-compare-note-input-left').click();
    await expect(page.getByTestId('btn-compare-note-input-left')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const cursor = page.getByTestId('compare-note-input-cursor-left');
    await expect(cursor).toBeVisible();
    const initialCursorBox = await cursor.boundingBox();
    if (!initialCursorBox) {
      throw new Error('Expected the left compare input cursor to be measurable.');
    }

    // sample-left.xml starts C D E F G A. These keys intentionally arrive as a
    // burst; compare persistence must serialize them rather than dropping F/G.
    const addBarButton = page.getByTestId('btn-compare-add-bar-left');
    await page.keyboard.type('efg');
    await expect(addBarButton).toBeDisabled({ timeout: 15000 });
    await expect(addBarButton).toBeEnabled({ timeout: 30000 });
    await expect
      .poll(async () => (await cursor.boundingBox())?.x ?? 0, {
        timeout: 30000,
      })
      .toBeGreaterThan(initialCursorBox.x);

    await page.evaluate(() => {
      window.open = () => null;
    });
    await page
      .getByRole('button', { name: /Open in Editor/ })
      .first()
      .click();
    const pitches = await page.evaluate(() => {
      const xml = JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || '';
      return [...xml.matchAll(/<step>([A-G])<\/step>/g)].map((m) => m[1]);
    });

    // Each press must land on the next note (C D E F -> E F G F), not repeatedly
    // re-edit the first one (which would instead read G D E F or similar).
    expect(pitches.slice(0, 4)).toEqual(['E', 'F', 'G', 'F']);
  });

  test('follows engine note-input order on a second staff', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent('/test_scores/two_staves_four_bars.musicxml')}&compareRight=${encodeURIComponent('/sample-right.xml')}&leftLabel=Left&rightLabel=Right`,
    );
    const leftPane = page.getByTestId('compare-pane-left');
    const firstCelloNote = leftPane.locator('svg .Note').nth(4);
    await expect(firstCelloNote).toBeVisible({ timeout: 30000 });

    await page.getByTestId('btn-compare-activate-left').click();
    let noteBox: Awaited<ReturnType<typeof firstCelloNote.boundingBox>> = null;
    await expect
      .poll(
        async () => {
          noteBox = await firstCelloNote.boundingBox();
          return noteBox?.width ?? 0;
        },
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
    const renderedNoteBox = noteBox as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    if (!renderedNoteBox) {
      throw new Error('Expected the first note on the second staff to be clickable.');
    }
    await page.mouse.click(
      renderedNoteBox.x + renderedNoteBox.width / 2,
      renderedNoteBox.y + renderedNoteBox.height / 2,
    );
    await expect(page.getByTestId('compare-selection-overlay-left').first()).toBeVisible();

    await page.getByTestId('btn-compare-note-input-left').click();
    await expect(page.getByTestId('btn-compare-note-input-left')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.type('def');

    const addBarButton = page.getByTestId('btn-compare-add-bar-left');
    await expect(addBarButton).toBeDisabled({ timeout: 15000 });
    await expect(addBarButton).toBeEnabled({ timeout: 30000 });

    await page.evaluate(() => {
      window.open = () => null;
    });
    await page
      .getByRole('button', { name: /Open in Editor/ })
      .first()
      .click();
    const parts = await page.evaluate(() => {
      const xml = JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || '';
      const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
      return Array.from(documentXml.querySelectorAll('part')).map((part) =>
        Array.from(part.querySelectorAll(':scope > measure')).map((measure) =>
          Array.from(measure.querySelectorAll(':scope > note > pitch > step')).map(
            (step) => step.textContent ?? '',
          ),
        ),
      );
    });

    expect(parts[0]?.slice(0, 4)).toEqual([['F'], ['A'], ['C'], ['E']]);
    expect(parts[1]?.slice(0, 4)).toEqual([['D'], ['E'], ['F'], ['E']]);
  });

  test('should keep compare labels and score contents on the same side', async ({ page }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Left&rightLabel=Right`,
    );
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.open = () => null;
    });

    const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
    await openInEditorButtons.first().click();
    const leftStored = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('openInEditor') || '{}'),
    );
    expect(leftStored.filename).toBe('Left.xml');
    // Assert on content unique to each fixture. <step>C</step> appears in both, so it
    // could not tell the sides apart; <step>D</step> exists only in sample-left.xml
    // and <step>B</step> only in sample-right.xml.
    expect(leftStored.xml).toContain('Sample Score - Version 1');
    expect(leftStored.xml).toContain('<step>D</step>');

    await openInEditorButtons.nth(1).click();
    const rightStored = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('openInEditor') || '{}'),
    );
    expect(rightStored.filename).toBe('Right.xml');
    expect(rightStored.xml).toContain('Sample Score - Version 2');
    expect(rightStored.xml).toContain('<step>B</step>');
  });

  test('should open left score in full editor in new tab when clicking "Open in Editor"', async ({
    page,
    context,
  }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`,
    );
    await page.waitForTimeout(3000);

    // Listen for new page (tab) to open
    const pagePromise = context.waitForEvent('page');

    // Click the "Open in Editor" button for the left pane
    const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
    await openInEditorButtons.first().click();

    // Wait for new tab to open
    const newPage = await pagePromise;
    await newPage.waitForLoadState();
    await newPage.waitForTimeout(3000);

    // Original page should still show compare view
    const compareModal = page.getByTestId('checkpoint-compare-modal');
    await expect(compareModal).toBeVisible();

    // New tab should show full editor
    await expect(newPage.getByTestId('shell-header')).toBeVisible();

    // The full editor has an activity bar; History is where the checkpoint sidebar lives.
    await expect(newPage.getByTestId('activity-bar')).toBeVisible();
    await newPage.getByTestId('activity-history').click();
    await expect(newPage.getByTestId('checkpoint-sidebar')).toBeVisible();

    // Score should be loaded in new tab
    await expect(newPage.locator('svg').first()).toBeVisible({ timeout: 10000 });

    // Clean up
    await newPage.close();
  });

  test('should open right score in full editor in new tab when clicking "Open in Editor"', async ({
    page,
    context,
  }) => {
    await page.goto(
      `/?compareLeft=${encodeURIComponent(leftXmlUrl)}&compareRight=${encodeURIComponent(rightXmlUrl)}&leftLabel=Version%201&rightLabel=Version%202`,
    );
    await page.waitForTimeout(3000);

    // Listen for new page (tab) to open
    const pagePromise = context.waitForEvent('page');

    // Click the "Open in Editor" button for the right pane
    const openInEditorButtons = page.getByRole('button', { name: /Open in Editor/ });
    await openInEditorButtons.nth(1).click();

    // Wait for new tab to open
    const newPage = await pagePromise;
    await newPage.waitForLoadState();
    await newPage.waitForTimeout(3000);

    // Original page should still show compare view
    const compareModal = page.getByTestId('checkpoint-compare-modal');
    await expect(compareModal).toBeVisible();

    // New tab should show full editor
    await expect(newPage.getByTestId('shell-header')).toBeVisible();

    // The full editor has an activity bar; History is where the checkpoint sidebar lives.
    await expect(newPage.getByTestId('activity-bar')).toBeVisible();
    await newPage.getByTestId('activity-history').click();
    await expect(newPage.getByTestId('checkpoint-sidebar')).toBeVisible();

    // Score should be loaded in new tab
    await expect(newPage.locator('svg').first()).toBeVisible({ timeout: 10000 });

    // Clean up
    await newPage.close();
  });
});
