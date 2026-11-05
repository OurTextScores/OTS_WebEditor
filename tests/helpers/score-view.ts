import { expect, type Page } from './diagnostic-test';

/** Wait for initial fit-width and its transform transition before measuring score coordinates. */
export async function waitForScoreViewStable(page: Page): Promise<void> {
  await expect(page.getByText('Loading score...')).toBeHidden({ timeout: 60_000 });
  // Initial fit-width is scheduled two frames after the score renders.
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));
  const wrapper = await page.getByTestId('score-wrapper').elementHandle();
  if (!wrapper) throw new Error('score wrapper not found');
  await wrapper.waitForElementState('stable', { timeout: 20_000 });
}
