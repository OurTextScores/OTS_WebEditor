import { expect, test } from '@playwright/test';

/**
 * Alignment-driven compare highlighting: checkpoint compare and AI review.
 *
 * Change review builds its highlights from server-supplied `scoreRegions`; these two build
 * theirs from the local measure alignment, and both go through
 * `buildPartLocalizedAlignmentHighlights`. That path used to draw the whole system for any
 * change, because `compareMeasureStatuses` collapsed every part into one flag per measure
 * before geometry ever saw it -- so an edit to the cello highlighted the violin too.
 *
 * The fixtures differ in exactly one pitch, in the lower part only. Their upper parts are
 * byte-identical (asserted at fixture-build time), so any highlight over the upper staff is
 * the collapse regressing.
 */
const BASE_SCORE = '/test_scores/two_staves_four_bars.musicxml';
const EDITED_SCORE = '/test_scores/two_staves_four_bars_lower_edit.musicxml';
const PART_COUNT = 2;

const openCompare = async (page: import('@playwright/test').Page) => {
  // No changeReviewId: this is the external/checkpoint compare path, which is the same
  // highlight builder AI review uses.
  await page.goto(
    `/?compareLeft=${encodeURIComponent(BASE_SCORE)}` +
      `&compareRight=${encodeURIComponent(EDITED_SCORE)}` +
      '&leftLabel=Base&rightLabel=Edited',
  );
  for (const side of ['left', 'right'] as const) {
    await expect(page.getByTestId(`compare-pane-${side}`).locator('svg .Note').first()).toBeVisible(
      { timeout: 120000 },
    );
  }
};

/** Screen rects of a pane's diff highlights. */
const highlightRects = (page: import('@playwright/test').Page, side: 'left' | 'right') =>
  page
    .getByTestId(`compare-pane-${side}`)
    .getByTestId(`compare-${side}-highlight`)
    .evaluateAll((els) =>
      els.map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { y: r.y, h: r.height, geometry: el.getAttribute('data-geometry') };
      }),
    );

/**
 * Staff centres for the pane, retried until the count is stable — a partially rendered SVG
 * reports a plausible-looking subset and would make correct highlights look misplaced.
 */
const staffCentres = async (page: import('@playwright/test').Page, side: 'left' | 'right') => {
  let centres: number[] = [];
  let previousCount = -1;
  await expect
    .poll(
      async () => {
        const next = await page
          .getByTestId(`compare-pane-${side}`)
          .locator('svg')
          .first()
          .evaluate((svg) => {
            const tops = Array.from(svg.querySelectorAll('.StaffLines'))
              .map((el) => (el as SVGGraphicsElement).getBoundingClientRect().y)
              .filter((y) => y !== 0)
              .sort((a, b) => a - b);
            const gap = tops.length > 1 ? tops[1] - tops[0] : 0;
            const staves: number[][] = [];
            for (const y of tops) {
              const current = staves[staves.length - 1];
              if (current && y - current[current.length - 1] <= gap * 1.8) {
                current.push(y);
              } else {
                staves.push([y]);
              }
            }
            return staves.map((lines) => lines[Math.floor(lines.length / 2)]);
          });
        const stable =
          next.length === previousCount && next.length >= PART_COUNT && next.every((c) => c > 0);
        previousCount = next.length;
        if (stable) {
          centres = next;
        }
        return stable;
      },
      {
        timeout: 30000,
        intervals: [250],
        message: `${side} pane never reported a stable staff layout`,
      },
    )
    .toBe(true);
  return centres;
};

test('a change in one part does not highlight the other part’s staff', async ({ page }) => {
  await openCompare(page);

  for (const side of ['left', 'right'] as const) {
    const centres = await staffCentres(page, side);
    const rects = await highlightRects(page, side);

    expect(rects.length, `${side} pane should highlight the edited bar`).toBeGreaterThan(0);

    const upperStaff = centres[0];
    const lowerStaff = centres[1];
    expect(lowerStaff - upperStaff, 'fixture should render two separated staves').toBeGreaterThan(
      4,
    );

    for (const rect of rects) {
      const covers = (centre: number) => centre >= rect.y - 1 && centre <= rect.y + rect.h + 1;
      expect(
        covers(upperStaff),
        `${side} highlight at y=${Math.round(rect.y)}..${Math.round(rect.y + rect.h)} ` +
          `covers the unchanged upper staff (centre ${Math.round(upperStaff)}); ` +
          'the part axis has been collapsed again',
      ).toBe(false);
      expect(
        covers(lowerStaff),
        `${side} highlight at y=${Math.round(rect.y)}..${Math.round(rect.y + rect.h)} ` +
          `should sit on the edited lower staff (centre ${Math.round(lowerStaff)})`,
      ).toBe(true);
    }
  }
});

test('alignment highlights use real staff geometry rather than an even split', async ({ page }) => {
  await openCompare(page);

  for (const side of ['left', 'right'] as const) {
    await expect
      .poll(async () => (await highlightRects(page, side)).every((r) => r.geometry === 'staff'), {
        timeout: 60000,
        message: `${side} pane stayed on the even-split fallback`,
      })
      .toBe(true);
  }
});
