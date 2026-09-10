import { expect, test } from '@playwright/test';

/**
 * Diagnostic: where do change-review highlights actually land?
 *
 * The fixtures are the two revisions from the reported review. Head m.17 is overfull
 * (nominal 3/4, actual 4/4), so the two scores lay that system out differently -- which
 * is exactly the case where assuming the panes share a geometry falls apart.
 */
const BASE_SCORE = '/test_scores/men-base.musicxml';
const HEAD_SCORE = '/test_scores/men-head.musicxml';
const REVIEW_ID = 'cr-geometry-fixture';
const PART_COUNT = 4;

const detail = {
  reviewId: REVIEW_ID,
  viewerUserId: 'user-1',
  workId: 'work-1',
  sourceId: 'source-1',
  status: 'open',
  permissions: {
    canRead: true,
    canEditDraft: true,
    canAddThread: true,
    canSubmit: true,
    canClose: true,
    canWithdraw: true,
    canReply: true,
    canResolve: true,
  },
};

/** One region per part on the overfull bar, plus a quiet bar for contrast. */
const region = (partIndex: number, measureIndex: number) => ({
  anchorId: `region-p${partIndex}-m${measureIndex}`,
  partId: `P${partIndex + 1}`,
  partIndex,
  partName: `Track ${partIndex + 1}`,
  side: 'head',
  changeType: 'modified',
  baseMeasureIndex: measureIndex,
  headMeasureIndex: measureIndex,
  baseMeasureNumber: `${measureIndex + 1}`,
  headMeasureNumber: `${measureIndex + 1}`,
  label: `Track ${partIndex + 1} - m. ${measureIndex + 1}`,
  summary: `Changed Track ${partIndex + 1} - m. ${measureIndex + 1}`,
  commentable: true,
  regionHash: `hash-p${partIndex}-m${measureIndex}`,
});

const diff = {
  reviewId: REVIEW_ID,
  fileKind: 'canonical',
  baseRevisionId: 'rev-base',
  headRevisionId: 'rev-head',
  scoreRegions: [
    ...Array.from({ length: PART_COUNT }, (_, p) => region(p, 16)),
    ...Array.from({ length: PART_COUNT }, (_, p) => region(p, 2)),
  ],
  bars: [],
  hunks: [],
  threads: [],
};

const open = async (page: import('@playwright/test').Page) => {
  await page.route(`**/api/proxy/change-reviews/${REVIEW_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    }),
  );
  await page.route(`**/api/proxy/change-reviews/${REVIEW_ID}/diff*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(diff),
    }),
  );

  await page.goto(
    `/?compareLeft=${encodeURIComponent(BASE_SCORE)}` +
      `&compareRight=${encodeURIComponent(HEAD_SCORE)}` +
      '&leftLabel=Rev%20%231&rightLabel=Rev%20%232' +
      `&changeReviewId=${REVIEW_ID}`,
  );

  await expect(page.getByTestId('compare-pane-left').locator('svg .Note').first()).toBeVisible({
    timeout: 120000,
  });
  await expect(page.getByTestId('compare-pane-right').locator('svg .Note').first()).toBeVisible({
    timeout: 120000,
  });
};

/** Screen-space rects of every highlight in a pane, top-to-bottom. */
const highlightRects = (page: import('@playwright/test').Page, side: 'left' | 'right') =>
  page
    .getByTestId(`compare-pane-${side}`)
    .getByTestId(`compare-${side}-highlight`)
    .evaluateAll((els) =>
      els
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            id: el.getAttribute('data-highlight-id') || '',
          };
        })
        .sort((a, b) => a.y - b.y),
    );

/**
 * Screen-space vertical centre of each staff in the pane, derived from the rendered
 * staff lines. Ground truth independent of whatever the highlight code believes.
 */
const readStaffCentres = (page: import('@playwright/test').Page, side: 'left' | 'right') =>
  page
    .getByTestId(`compare-pane-${side}`)
    .locator('svg')
    .first()
    .evaluate((svg) => {
      const tops = Array.from(svg.querySelectorAll('.StaffLines'))
        .map((el) => (el as SVGGraphicsElement).getBoundingClientRect().y)
        // A rect of 0 means the element had no layout when we measured, not that a
        // staff sits at the top of the viewport. Measuring those as real positions
        // silently turns a flaky read into a geometry "failure".
        .filter((y) => y !== 0)
        .sort((a, b) => a - b);
      // Group by gap rather than fixed fives: percussion (1 line) and tab (6) staves
      // exist, and a fixed stride would silently mis-group them.
      const staves: number[][] = [];
      const typicalLineGap = tops.length > 1 ? tops[1] - tops[0] : 0;
      for (const y of tops) {
        const current = staves[staves.length - 1];
        if (current && y - current[current.length - 1] <= typicalLineGap * 1.8) {
          current.push(y);
        } else {
          staves.push([y]);
        }
      }
      return staves.map((lines) => lines[Math.floor(lines.length / 2)]);
    });

/** Staff centres, retried until the pane reports a stable, measurable layout. */
const staffCentres = async (page: import('@playwright/test').Page, side: 'left' | 'right') => {
  // Require the count to stabilise across consecutive reads. A partially-rendered SVG
  // satisfies "at least PART_COUNT non-zero centres" while missing most of the page, and
  // asserting against that reports correct highlights as misplaced.
  let centres: number[] = [];
  let previousCount = -1;
  await expect
    .poll(
      async () => {
        const next = await readStaffCentres(page, side);
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

/**
 * The staff boxes are probed from the engine asynchronously, and the highlights render
 * from the even-split fallback until that lands. Wait for the real geometry rather than
 * racing it -- and fail loudly if it never arrives, since a silent permanent fallback is
 * the regression this file exists to catch.
 */
const waitForStaffGeometry = async (
  page: import('@playwright/test').Page,
  side: 'left' | 'right',
) => {
  await expect
    .poll(
      async () =>
        page
          .getByTestId(`compare-pane-${side}`)
          .getByTestId(`compare-${side}-highlight`)
          .evaluateAll(
            (els) =>
              els.length > 0 && els.every((el) => el.getAttribute('data-geometry') === 'staff'),
          ),
      { timeout: 60000, message: `${side} pane never resolved real staff geometry` },
    )
    .toBe(true);
};

test('each pane places a highlight over that score’s own staff', async ({ page }) => {
  await open(page);

  for (const side of ['left', 'right'] as const) {
    await waitForStaffGeometry(page, side);
    const rects = await highlightRects(page, side);
    const centres = await staffCentres(page, side);

    expect(rects.length, `${side} pane should draw 8 highlights`).toBe(8);
    expect(centres.length, `${side} pane should render staves`).toBeGreaterThanOrEqual(PART_COUNT);

    // Every highlight must contain the centre line of some staff. The even split put
    // parts 2 and 3 of the head score off their staves entirely, because that score's
    // staff 2->3 gap is ~16% larger than its staff 1->2 gap.
    for (const rect of rects) {
      const covered = centres.some((c) => c >= rect.y - 1 && c <= rect.y + rect.h + 1);
      expect(
        covered,
        `${side} highlight ${rect.id} at y=${Math.round(rect.y)}..${Math.round(rect.y + rect.h)} ` +
          `covers no staff centre (staff centres: ${centres.map(Math.round).join(', ')})`,
      ).toBe(true);
    }
  }
});

test('a bar highlight is as wide as that bar in its own pane', async ({ page }) => {
  await open(page);

  // Head m.17 is overfull (nominal 3/4, actual 4/4), so it is laid out wider than the
  // same bar in the base score. Each pane must size the highlight from its own layout
  // rather than from a geometry shared between the two.
  await waitForStaffGeometry(page, 'left');
  await waitForStaffGeometry(page, 'right');
  const left = await highlightRects(page, 'left');
  const right = await highlightRects(page, 'right');

  expect(left.length, 'left pane drew no highlights').toBeGreaterThan(0);
  expect(right.length, 'right pane drew no highlights').toBeGreaterThan(0);

  // The base score lays the overfull bar out narrower than the head score does, so the
  // narrowest highlight differs between the panes. A shared geometry would tie them.
  const narrowest = (rects: { w: number }[]) => Math.min(...rects.map((r) => r.w));
  const leftNarrowest = narrowest(left);
  const rightNarrowest = narrowest(right);

  expect(
    Math.abs(leftNarrowest - rightNarrowest),
    `each pane must size bars from its own layout ` +
      `(narrowest left ${Math.round(leftNarrowest)}, right ${Math.round(rightNarrowest)})`,
  ).toBeGreaterThan(1);

  // And the head pane is the one holding the overfull (wider) bar.
  expect(
    leftNarrowest,
    'the base pane should hold the narrower rendering of the overfull bar',
  ).toBeLessThan(rightNarrowest);
});
