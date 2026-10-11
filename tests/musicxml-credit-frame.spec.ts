import { expect, test } from 'playwright/test';

/**
 * A MusicXML file places its credits (title, composer, lyricist) by position, and the importer
 * builds a title frame tall enough to hold them. If that frame is left to size itself it
 * shrinks to its first lines, and the composer and lyricist are drawn on top of the first
 * staff. It only shows at staff sizes other than the default, which is every score exported by
 * desktop MuseScore that the site receives.
 */
test('imported MusicXML credits stay above the first system', async ({ page }) => {
  await page.goto('/?score=/test_scores/credits_small_staff.musicxml');
  await page.waitForSelector('svg .Clef', { timeout: 60_000 });

  const layout = await page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect();
    const credits = [...document.querySelectorAll('svg .Text')].map(box);
    const staff = [...document.querySelectorAll('svg .StaffLines')].map(box);
    return {
      credits: credits.length,
      lowestCredit: Math.max(...credits.map((rect) => rect.bottom)),
      firstStaffTop: Math.min(...staff.map((rect) => rect.top)),
    };
  });

  // Title, subtitle, lyricist and composer.
  expect(layout.credits).toBe(4);
  expect(layout.lowestCredit).toBeLessThan(layout.firstStaffTop);
});
