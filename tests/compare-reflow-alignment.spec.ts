import { expect, test } from '@playwright/test';

/**
 * Compare reflow must keep the two panes row-aligned.
 *
 * Breaking only at mismatch-block boundaries is not enough: `LayoutMode::SYSTEM` honours
 * explicit breaks but still wraps a system on width, and these two scores are engraved to
 * different widths (head m.17 is overfull -- nominal 3/4, actual 4/4). The panes ended up
 * with 23 and 24 systems, so every row below the first divergence sat opposite the wrong bar.
 *
 * Both fixtures have 68 bars per part, so the alignment is 1:1 and the panes must agree.
 */
const BASE_SCORE = '/test_scores/men-base.musicxml';
const HEAD_SCORE = '/test_scores/men-head.musicxml';
const PART_COUNT = 4;

/** Systems in a pane, counted from the rendered staff lines. */
const readSystemCount = (
  page: import('@playwright/test').Page,
  side: 'left' | 'right',
  partCount: number,
) =>
  page
    .getByTestId(`compare-pane-${side}`)
    .locator('svg')
    .first()
    .evaluate((svg, partCount) => {
      const tops = Array.from(svg.querySelectorAll('.StaffLines'))
        .map((el) => (el as SVGGraphicsElement).getBoundingClientRect().y)
        // Zero means no layout at the moment of measuring, not a staff at the top
        // of the viewport.
        .filter((y) => y !== 0)
        .sort((a, b) => a - b);
      const gap = tops.length > 1 ? tops[1] - tops[0] : 0;
      const staves: number[][] = [];
      for (const y of tops) {
        const cur = staves[staves.length - 1];
        if (cur && y - cur[cur.length - 1] <= gap * 1.8) {
          cur.push(y);
        } else {
          staves.push([y]);
        }
      }
      return Math.round(staves.length / partCount);
    }, partCount);

/**
 * Reflow applies breaks to one score then the other and re-renders each in turn, so the
 * panes pass through a window where one has been resynced and the other has not. Poll both
 * together: what matters is that they converge, not that every intermediate frame agrees.
 */
const convergedSystemCounts = async (
  page: import('@playwright/test').Page,
  partCount = PART_COUNT,
) => {
  let counts = { left: -1, right: -2 };
  await expect
    .poll(
      async () => {
        counts = {
          left: await readSystemCount(page, 'left', partCount),
          right: await readSystemCount(page, 'right', partCount),
        };
        return counts.left > 0 && counts.left === counts.right;
      },
      {
        timeout: 60000,
        intervals: [500],
        message: 'panes never converged on a system count',
      },
    )
    .toBe(true);
  return counts;
};

test('reflow gives both compare panes the same system count', async ({ page }) => {
  await page.goto(
    `/?compareLeft=${encodeURIComponent(BASE_SCORE)}` +
      `&compareRight=${encodeURIComponent(HEAD_SCORE)}` +
      '&leftLabel=Base&rightLabel=Head',
  );
  for (const side of ['left', 'right'] as const) {
    await expect(page.getByTestId(`compare-pane-${side}`).locator('svg .Note').first()).toBeVisible(
      { timeout: 120000 },
    );
  }

  const { left, right } = await convergedSystemCounts(page);

  expect(left, 'panes should agree once reflow settles').toBe(right);

  // Guard against "aligned" being achieved by collapsing to one bar per system, which
  // aligns perfectly but makes the score unreadable.
  expect(left, 'reflow should not degenerate to one bar per system').toBeLessThan(60);
});

// Line breaks alone cannot close this: the inserted bar's alignment row carries a null
// on the base side, so the head's wrap after it has no counterpart row to mirror a break
// onto. Measured on this fixture -- base 1-2 systems against the head's 3, never levelling.
// The structural-gap phase measures after wrap resync settles and adds the missing vertical
// extent to the shorter side.
test('panes stay aligned when one side has an inserted bar', async ({ page }) => {
  // The head fixture repeats bar 2, so it has 5 bars per part against the base's 4.
  // Alignment rows carry a null on the base side for the inserted bar, and
  // buildResyncBreaks skips those -- a line break cannot leave a gap. What it can do is
  // break both panes at the same alignment rows, which keeps the system counts equal and
  // the rows opposite each other; the extra bar makes one system denser, not taller.
  await page.goto(
    `/?compareLeft=${encodeURIComponent('/test_scores/two_staves_four_bars.musicxml')}` +
      `&compareRight=${encodeURIComponent('/test_scores/two_staves_four_bars_inserted.musicxml')}` +
      '&leftLabel=Base&rightLabel=Inserted',
  );
  for (const side of ['left', 'right'] as const) {
    await expect(page.getByTestId(`compare-pane-${side}`).locator('svg .Note').first()).toBeVisible(
      { timeout: 120000 },
    );
  }

  // A spacer adds vertical space without changing the system count, so counts are the
  // wrong metric here. What matters is that the last row of music ends up at the same
  // height in both panes -- that is what "the panes line up" means to a reader.
  const lastRowTop = (side: 'left' | 'right') =>
    page
      .getByTestId(`compare-pane-${side}`)
      .locator('svg')
      .first()
      .evaluate((svg) => {
        const tops = Array.from(svg.querySelectorAll('.StaffLines'))
          .map((el) => (el as SVGGraphicsElement).getBoundingClientRect().y)
          .filter((y) => y !== 0);
        return tops.length ? Math.max(...tops) : null;
      });

  let lefts: number | null = null;
  let rights: number | null = null;
  try {
    await expect
      .poll(
        async () => {
          lefts = await lastRowTop('left');
          rights = await lastRowTop('right');
          return lefts !== null && rights !== null
            ? Math.abs(lefts - rights)
            : Number.POSITIVE_INFINITY;
        },
        { timeout: 60000, intervals: [500], message: 'panes never levelled across the insertion' },
      )
      .toBeLessThan(12);
  } catch {
    throw new Error(`panes never levelled across the insertion (left ${lefts}, right ${rights})`);
  }

  expect(Math.abs((lefts as unknown as number) - (rights as unknown as number))).toBeLessThan(12);
});
