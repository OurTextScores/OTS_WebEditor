import { expect, test } from 'playwright/test';

/**
 * Test that note entry mode preserves the user's selected duration across
 * multiple consecutive note entries. This is a regression test for the bug
 * where pressing 7D7D (whole note D, then another D) would only produce one
 * whole note because the duration was reset after each note entry.
 */
test.skip('7D7D produces two whole notes - duration preserved across entries', async ({ page }) => {
  // Capture console logs from the page
  page.on('console', (msg) => {
    if (msg.text().includes('[NoteEntry]')) {
      console.log('PAGE:', msg.text());
    }
  });

  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  // Check if note entry APIs are available
  const hasNoteEntryApi = await page.evaluate(() => {
    const score = (window as any).__webmscore;
    return (
      typeof score?.setNoteEntryMode === 'function' &&
      typeof score?.setInputDurationType === 'function' &&
      typeof score?.addPitchByStep === 'function'
    );
  });
  test.skip(!hasNoteEntryApi, 'Note entry APIs not available in this webmscore build');

  // Helper to read MSCX content
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

  // Helper to count notes with a specific duration type
  const countNotesWithDuration = (mscx: string, durationType: string): number => {
    // Match <Note> elements and check if they have the specified durationType
    // The structure is: <Chord><durationType>...</durationType>...<Note>...</Note></Chord>
    const chordRegex = /<Chord>[\s\S]*?<durationType>(\w+)<\/durationType>[\s\S]*?<\/Chord>/g;
    let count = 0;
    let match;
    while ((match = chordRegex.exec(mscx)) !== null) {
      if (match[1] === durationType) {
        // Count Note elements within this chord
        const noteMatches = match[0].match(/<Note>/g);
        count += noteMatches ? noteMatches.length : 0;
      }
    }
    return count;
  };

  // Get initial counts
  const initialMscx = await readMscx();
  const initialWholeNotes = countNotesWithDuration(initialMscx, 'whole');

  // Select the first note by clicking on it
  await page.locator('svg .Note').first().click();

  // Wait for selection to be processed - check for either the overlay or enabled buttons
  await expect.poll(async () => {
    const deleteEnabled = await page.getByTestId('btn-delete').isEnabled().catch(() => false);
    const overlayVisible = await page.getByTestId('selection-overlay').isVisible().catch(() => false);
    return deleteEnabled || overlayVisible;
  }, { timeout: 10_000 }).toBe(true);

  // Enable note entry mode
  await page.getByTestId('btn-note-entry').click();

  // Wait for note entry mode to be enabled
  await expect(page.getByTestId('btn-note-entry')).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

  // Press 7 to select whole note duration (goes through React keyboard handler)
  await page.keyboard.press('7');
  await page.waitForTimeout(300);

  // Check the input duration after pressing 7
  const durationAfter7 = await page.evaluate(() => {
    const score = (window as any).__webmscore;
    return score?.inputState?.duration ?? 'unknown';
  });
  console.log('Duration after pressing 7:', durationAfter7);

  // Press D to enter first whole note
  await page.keyboard.press('d');
  await page.waitForTimeout(800);

  // Check the MSCX after first D
  const mscxAfterFirstD = await readMscx();
  const durationsAfterFirstD: string[] = [];
  const firstDRegex = /<Chord>[\s\S]*?<durationType>(\w+)<\/durationType>[\s\S]*?<\/Chord>/g;
  let m;
  while ((m = firstDRegex.exec(mscxAfterFirstD)) !== null) {
    durationsAfterFirstD.push(m[1]);
  }
  console.log('Durations after first D:', durationsAfterFirstD);

  // Check the input duration before second D
  const durationBeforeSecondD = await page.evaluate(() => {
    const score = (window as any).__webmscore;
    return score?.inputState?.duration ?? 'unknown';
  });
  console.log('Duration before second D:', durationBeforeSecondD);

  // Press D again to enter second whole note - the TypeScript fix should preserve duration
  await page.keyboard.press('d');
  await page.waitForTimeout(800);

  // Check the MSCX after second D
  const mscxAfterSecondD = await readMscx();
  const durationsAfterSecondD: string[] = [];
  const secondDRegex = /<Chord>[\s\S]*?<durationType>(\w+)<\/durationType>[\s\S]*?<\/Chord>/g;
  while ((m = secondDRegex.exec(mscxAfterSecondD)) !== null) {
    durationsAfterSecondD.push(m[1]);
  }
  console.log('Durations after second D:', durationsAfterSecondD);

  // Verify that we now have 2 more whole notes than before
  const finalMscx = await readMscx();
  const finalWholeNotes = countNotesWithDuration(finalMscx, 'whole');

  // Debug: log all duration types found
  const allDurations: string[] = [];
  const debugRegex = /<Chord>[\s\S]*?<durationType>(\w+)<\/durationType>[\s\S]*?<\/Chord>/g;
  let debugMatch;
  while ((debugMatch = debugRegex.exec(finalMscx)) !== null) {
    allDurations.push(debugMatch[1]);
  }
  console.log('Initial whole notes:', initialWholeNotes);
  console.log('Final whole notes:', finalWholeNotes);
  console.log('All duration types found:', allDurations);

  // We should have added 2 whole notes
  expect(finalWholeNotes).toBe(initialWholeNotes + 2);
});

/**
 * Test that changing duration mid-entry works correctly.
 * Press 7D5D should produce one whole note D and one quarter note D.
 */
test.skip('7D5D produces one whole note and one quarter note', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  // Check if note entry APIs are available
  const hasNoteEntryApi = await page.evaluate(() => {
    const score = (window as any).__webmscore;
    return (
      typeof score?.setNoteEntryMode === 'function' &&
      typeof score?.setInputDurationType === 'function' &&
      typeof score?.addPitchByStep === 'function'
    );
  });
  test.skip(!hasNoteEntryApi, 'Note entry APIs not available in this webmscore build');

  // Helper to read MSCX content
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

  // Helper to count notes with a specific duration type
  const countNotesWithDuration = (mscx: string, durationType: string): number => {
    const chordRegex = /<Chord>[\s\S]*?<durationType>(\w+)<\/durationType>[\s\S]*?<\/Chord>/g;
    let count = 0;
    let match;
    while ((match = chordRegex.exec(mscx)) !== null) {
      if (match[1] === durationType) {
        const noteMatches = match[0].match(/<Note>/g);
        count += noteMatches ? noteMatches.length : 0;
      }
    }
    return count;
  };

  // Get initial counts
  const initialMscx = await readMscx();
  const initialWholeNotes = countNotesWithDuration(initialMscx, 'whole');
  const initialQuarterNotes = countNotesWithDuration(initialMscx, 'quarter');

  // Select the first note by clicking on it
  await page.locator('svg .Note').first().click();

  // Wait for selection to be processed - check for either the overlay or enabled buttons
  await expect.poll(async () => {
    const deleteEnabled = await page.getByTestId('btn-delete').isEnabled().catch(() => false);
    const overlayVisible = await page.getByTestId('selection-overlay').isVisible().catch(() => false);
    return deleteEnabled || overlayVisible;
  }, { timeout: 10_000 }).toBe(true);

  // Enable note entry mode
  await page.getByTestId('btn-note-entry').click();
  await expect(page.getByTestId('btn-note-entry')).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });

  // Press 7 to select whole note duration
  await page.keyboard.press('7');
  await page.waitForTimeout(200);

  // Press D to enter first whole note
  await page.keyboard.press('d');
  await page.waitForTimeout(500);

  // Press 5 to change to quarter note duration
  await page.keyboard.press('5');
  await page.waitForTimeout(200);

  // Press D to enter quarter note
  await page.keyboard.press('d');
  await page.waitForTimeout(500);

  // Verify counts
  const finalMscx = await readMscx();
  const finalWholeNotes = countNotesWithDuration(finalMscx, 'whole');
  const finalQuarterNotes = countNotesWithDuration(finalMscx, 'quarter');

  // We should have added 1 whole note and 1 quarter note
  expect(finalWholeNotes).toBe(initialWholeNotes + 1);
  expect(finalQuarterNotes).toBe(initialQuarterNotes + 1);
});
