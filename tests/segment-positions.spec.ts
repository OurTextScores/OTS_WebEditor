import { expect, test } from 'playwright/test';

/**
 * The engine's note-level positions (`segmentPositions`) used to trap with "function signature mismatch" on most real
 * scores and report a zero width for every note. The player's note highlighting depends on both being right.
 */
for (const score of [
  '/test_scores/bach_orig.mscz',
  '/test_scores/single_note_c4.musicxml',
  '/test_scores/two_chords.musicxml',
  '/test_scores/three_notes_slur.musicxml',
]) {
  test(`segmentPositions works on ${score}, with a real width for every note`, async ({ page }) => {
    await page.goto(`/?score=${score}`);
    await page.waitForSelector('svg .Note', { timeout: 90_000 });
    const result = await page.evaluate(async () => {
      const engine = (
        window as unknown as {
          __webmscore: {
            segmentPositions: () => Promise<{
              elements: { id: number; sx: number; width?: number }[];
              events: { elid: number; position: number }[];
            }>;
          };
        }
      ).__webmscore;
      const positions = await engine.segmentPositions();
      return {
        elements: positions.elements.length,
        events: positions.events.length,
        narrowest: Math.min(...positions.elements.map((element) => element.width ?? element.sx)),
        badEvents: positions.events.filter(
          (event) => event.elid < 0 || event.elid >= positions.elements.length,
        ).length,
      };
    });
    expect(result.elements).toBeGreaterThan(0);
    expect(result.events).toBeGreaterThanOrEqual(result.elements);
    expect(result.narrowest).toBeGreaterThan(0);
    expect(result.badEvents).toBe(0);
  });
}
