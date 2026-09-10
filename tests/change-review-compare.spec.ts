import { expect, test } from '@playwright/test';

/**
 * Collaborative two-pane change review, the mode behind
 * `/change-reviews/<id>` on ourtextscores.com.
 *
 * The CR page builds the editor URL as
 *   ?compareLeft=<base revision>&compareRight=<head revision>
 *    &leftLabel=Rev%20%23<base>&rightLabel=Rev%20%23<head>&changeReviewId=<id>
 * (frontend/app/change-reviews/change-review-detail-client.tsx), so **base is the
 * left pane and head is the right pane**, and the editor loads the *right* URL as
 * the live score with the left one as the auxiliary. Three orientation systems
 * therefore meet in this mode: pane (left/right), score identity (live/auxiliary)
 * and revision (base/head).
 *
 * Two production defects this sprint came from combining two of them by position
 * (`e2b090d7`, `45cdc149`) and a third from reading score-keyed state into a pane
 * (`8fdae2df`). Each fix was verified in embed external compare; this file pins the
 * same invariants for the change-review variant, which additionally carries the
 * base/head axis that nothing else has.
 *
 * The fixtures are deliberately different shapes — 2 parts / 8 notes versus
 * 1 part / 6 notes. `embed-mode.spec.ts:497` showed that two same-shaped fixtures
 * make a swapped render nearly invisible.
 */
const BASE_SCORE = '/test_scores/two_staves_four_bars.musicxml';
const HEAD_SCORE = '/sample-right.xml';
const REVIEW_ID = 'cr-orientation-fixture';

const BASE_PART_COUNT = 2;
const HEAD_PART_COUNT = 1;

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

/** One commentable bar per side, at different measures so a swap cannot alias. */
const bars = [
  {
    kind: 'score_bar',
    anchorId: 'bar-base',
    revisionId: 'rev-base',
    side: 'base',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 1,
    measureNumber: '2',
    measureHash: 'hash-base',
    label: 'Base bar 2',
    commentable: true,
  },
  {
    kind: 'score_bar',
    anchorId: 'bar-head',
    revisionId: 'rev-head',
    side: 'head',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureNumber: '1',
    measureHash: 'hash-head',
    label: 'Head bar 1',
    commentable: true,
  },
];

const thread = (anchorId: string) => ({
  threadId: `thread-${anchorId}`,
  status: 'open',
  diffAnchor: { anchorId, lineText: anchorId },
  comments: [
    {
      commentId: `comment-${anchorId}`,
      userId: 'user-1',
      username: 'reviewer',
      content: `comment on ${anchorId}`,
      createdAt: '2026-07-31T00:00:00.000Z',
    },
  ],
});

const diff = {
  reviewId: REVIEW_ID,
  fileKind: 'canonical',
  baseRevisionId: 'rev-base',
  headRevisionId: 'rev-head',
  scoreRegions: [],
  bars,
  hunks: [],
  // Bars only reach the gutter when focused or threaded, so give each one a thread.
  threads: [thread('bar-base'), thread('bar-head')],
};

const openChangeReviewCompare = async (page: import('@playwright/test').Page) => {
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
    timeout: 60000,
  });
  await expect(page.getByTestId('compare-pane-right').locator('svg .Note').first()).toBeVisible({
    timeout: 60000,
  });
};

/**
 * A pane's column, which holds its header (label, Checkpoint badge, Open in Editor)
 * alongside the viewport the testid is on.
 */
const column = (page: import('@playwright/test').Page, side: 'left' | 'right') =>
  page.getByTestId(`compare-pane-${side}`).locator('xpath=../..');

/** Reads the score a pane exports through its own Open in Editor button. */
const exportedPartCount = async (page: import('@playwright/test').Page, side: 'left' | 'right') => {
  await page.evaluate(() => {
    window.open = () => null;
    sessionStorage.removeItem('openInEditor');
  });
  await column(page, side)
    .getByRole('button', { name: /Open in Editor/ })
    .click();
  return page.evaluate(() => {
    const xml = JSON.parse(sessionStorage.getItem('openInEditor') || '{}').xml || '';
    return new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('part').length;
  });
};

test.describe('Change review compare panes', () => {
  test('renders the base revision on the left and the head revision on the right', async ({
    page,
  }) => {
    await openChangeReviewCompare(page);

    // The base fixture has two parts and eight notes; the head fixture has one
    // part and six. A swapped render inverts both counts.
    await expect
      .poll(async () => page.getByTestId('compare-pane-left').locator('svg .Note').count(), {
        timeout: 30000,
      })
      .toBe(8);
    await expect
      .poll(async () => page.getByTestId('compare-pane-right').locator('svg .Note').count(), {
        timeout: 30000,
      })
      .toBe(6);
  });

  test('keeps each revision label on the pane that draws that revision', async ({ page }) => {
    await openChangeReviewCompare(page);

    // Label and content must agree: the CR page names the left pane after the
    // base revision, so "Rev #1" has to sit above the two-part score.
    await expect(column(page, 'left').getByText('Rev #1', { exact: true })).toBeVisible();
    await expect(column(page, 'right').getByText('Rev #2', { exact: true })).toBeVisible();

    expect(await exportedPartCount(page, 'left')).toBe(BASE_PART_COUNT);
    expect(await exportedPartCount(page, 'right')).toBe(HEAD_PART_COUNT);
  });

  test('hit-tests a click against the score its own pane displays', async ({ page }) => {
    await openChangeReviewCompare(page);

    // The e2b090d7 defect wrote one score's measure positions into the other
    // pane's hit-test state, so a click matched nothing and cleared silently.
    for (const side of ['left', 'right'] as const) {
      await page.getByTestId(`btn-compare-activate-${side}`).click();
      const note = page.getByTestId(`compare-pane-${side}`).locator('svg .Note').first();
      const box = await note.boundingBox();
      if (!box) throw new Error(`Expected a clickable note in the ${side} pane.`);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId(`compare-selection-overlay-${side}`).first()).toBeVisible({
        timeout: 15000,
      });
    }
  });

  test('reports a failed base revision on the base pane, leaving the head pane readable', async ({
    page,
  }) => {
    // The base revision is the auxiliary score, and its load state is named after
    // that role (compareRightLoading/Error), not after a pane. Reading it straight
    // into the right pane -- the `8fdae2df` defect -- would cover the head score,
    // which renders perfectly well, and leave the empty base pane unexplained.
    await page.route(`**${BASE_SCORE}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/xml',
        body: '<?xml version="1.0"?><not-a-score/>',
      }),
    );
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

    const leftPane = page.getByTestId('compare-pane-left');
    const rightPane = page.getByTestId('compare-pane-right');

    await expect(leftPane.getByText(/checkpoint score|Score not loaded/i)).toBeVisible({
      timeout: 60000,
    });
    await expect(rightPane.locator('svg .Note').first()).toBeVisible({ timeout: 60000 });
    await expect(rightPane.getByText(/checkpoint score|Score not loaded/i)).toHaveCount(0);
  });

  test('keeps pane edits in the browser, writing nothing back to the review', async ({ page }) => {
    // Half of the design's AC-13: a change review's server revisions and anchors are
    // immutable, and the two panes are browser-local working copies. Editing one must
    // not write to the review API -- reads are expected, writes are not.
    const requests: { method: string; url: string }[] = [];
    await page.route('**/api/proxy/**', async (route) => {
      const request = route.request();
      requests.push({ method: request.method(), url: request.url() });
      const url = request.url();
      if (url.includes('/diff')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(diff),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detail),
      });
    });

    await page.goto(
      `/?compareLeft=${encodeURIComponent(BASE_SCORE)}` +
        `&compareRight=${encodeURIComponent(HEAD_SCORE)}` +
        '&leftLabel=Rev%20%231&rightLabel=Rev%20%232' +
        `&changeReviewId=${REVIEW_ID}`,
    );
    await expect(page.getByTestId('compare-pane-left').locator('svg .Note').first()).toBeVisible({
      timeout: 60000,
    });

    await page.getByTestId('btn-compare-activate-left').click();
    await page.getByTestId('btn-compare-add-bar-left').click();
    // The engine round-trip has to finish, or "no writes" would just mean "nothing
    // happened yet". The button re-enabling is the edit having settled.
    await expect(page.getByTestId('btn-compare-add-bar-left')).toBeDisabled({ timeout: 15000 });
    await expect(page.getByTestId('btn-compare-add-bar-left')).toBeEnabled({ timeout: 30000 });

    const writes = requests.filter((request) => request.method !== 'GET');
    expect(writes, `unexpected review writes: ${JSON.stringify(writes)}`).toEqual([]);
    expect(requests.some((request) => request.url.includes(REVIEW_ID))).toBe(true);
  });

  test('places review bars on the pane holding their revision side', async ({ page }) => {
    await openChangeReviewCompare(page);

    // The gutter labels a bar L/R from bar.side, which is base/head. If that axis
    // ever came apart from the pane axis, the base bar would read R2.
    await expect(page.getByText('L2', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('R1', { exact: true })).toBeVisible();
    await expect(page.getByText('Base bar 2')).toBeVisible();
    await expect(page.getByText('Head bar 1')).toBeVisible();
  });
});
