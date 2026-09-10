import { expect, test } from '@playwright/test';

/**
 * `setMeasureSpacer` — vertical padding below one staff of one measure.
 *
 * Compare needs this because a line break can move a bar to another system but cannot leave
 * a hole where the other pane has an extra bar. Alignment across an insertion or deletion is
 * only reachable with real space.
 *
 * Driven through the dev-only `window.__webmscore` handle (AGENTS.md verification checklist
 * step 5) rather than through the UI, because no UI exposes it yet.
 */
const SCORE = '/test_scores/men-base.musicxml';

test('a spacer pushes later systems down, and removing it restores the layout', async ({
  page,
}) => {
  await page.goto(`/?score=${encodeURIComponent(SCORE)}`);
  await expect(page.getByTestId('svg-container').locator('svg .Note').first()).toBeVisible({
    timeout: 120000,
  });

  const result = await page.evaluate(async () => {
    type MeasurePosition = { y: number; page: number };
    type MeasureSpacerScore = {
      measurePositions: () => Promise<{ elements?: MeasurePosition[] }>;
      setMeasureSpacer: (
        measureIndex: number,
        staffIndex: number,
        amount: number,
      ) => Promise<boolean>;
    };
    const score = (window as typeof window & { __webmscore?: MeasureSpacerScore }).__webmscore;
    if (!score) {
      return { error: 'no __webmscore handle' };
    }
    if (typeof score.setMeasureSpacer !== 'function') {
      return { error: 'setMeasureSpacer missing from the bridge' };
    }

    const readAt = async (measureIndex: number) => {
      const positions = await score.measurePositions();
      const el = positions?.elements?.[measureIndex];
      return el ? { y: el.y, page: el.page } : null;
    };

    // Pick a probe on the same page as measure 0: measurePositions y is page-local,
    // so a measure on a later page would not move even if the spacer worked.
    const first = await readAt(0);
    const all = await score.measurePositions();
    const elements = all.elements ?? [];
    let PROBE = -1;
    for (let i = 1; i < elements.length; i += 1) {
      const el = elements[i];
      if (el.page === first?.page && el.y > (first?.y ?? 0)) {
        PROBE = i;
        break;
      }
    }
    const beforeR = PROBE >= 0 ? await readAt(PROBE) : null;
    const applied = await score.setMeasureSpacer(0, 0, 12);
    const withR = PROBE >= 0 ? await readAt(PROBE) : null;
    const removed = await score.setMeasureSpacer(0, 0, 0);
    const afterR = PROBE >= 0 ? await readAt(PROBE) : null;

    return {
      applied,
      removed,
      PROBE,
      firstPage: first?.page,
      firstY: first?.y,
      before: beforeR?.y,
      withSpacer: withR?.y,
      after: afterR?.y,
      pageCount: elements.length,
    };
  });

  expect(result.error, `bridge problem: ${result.error}`).toBeUndefined();
  expect(result.applied, 'setMeasureSpacer should report success').toBe(true);
  expect(result.removed, 'removing the spacer should report success').toBe(true);

  expect(
    result.withSpacer,
    `probe measure should move down (was ${result.before}, became ${result.withSpacer})`,
  ).toBeGreaterThan(result.before as number);

  // Removal must return the layout, or compare could not restore the score on exit.
  expect(
    Math.abs((result.after as number) - (result.before as number)),
    `removing the spacer should restore the original y (${result.before} vs ${result.after})`,
  ).toBeLessThan(1);
});
