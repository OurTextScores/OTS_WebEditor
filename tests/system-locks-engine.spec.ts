import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

// System locks end to end: the Properties UI (main) against the native 4.7 commands (engine-ms47-spike). Skipped on
// engines without the API (the 4.00 bridge), where the UI hides the controls.

type LockApi = {
  getSystemLockState?: () => Promise<unknown>;
  saveMsc?: (format: string) => Promise<Uint8Array>;
};

const lockState = (page: import('playwright/test').Page) =>
  page.evaluate(async () => {
    const score = (window as unknown as { __webmscore?: LockApi }).__webmscore;
    return score?.getSystemLockState ? JSON.stringify(await score.getSystemLockState()) : null;
  });

const mscxHasLock = (page: import('playwright/test').Page) =>
  page.evaluate(async () => {
    const score = (window as unknown as { __webmscore?: LockApi }).__webmscore;
    const bytes = await score!.saveMsc!('mscx');
    return /<systemLock>/.test(new TextDecoder().decode(bytes));   // <SystemLocks><systemLock> in 4.5+
  });

test('locks the selected measures onto one system from Properties, and undo releases them', async ({ page }) => {
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page.locator('svg .Note').first().waitFor({ timeout: 60_000 });
  const hasApi = await page.evaluate(
    () => typeof (window as unknown as { __webmscore?: LockApi }).__webmscore?.getSystemLockState === 'function',
  );
  test.skip(!hasApi, 'engine without the system-lock API');

  // A two-bar range: click the first note, extend by bar
  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await page.keyboard.press('Control+Shift+ArrowRight');
  await page.keyboard.press('Control+Shift+ArrowRight');

  await runCommand(page, 'view.panel.properties');
  const region = page.getByRole('region', { name: 'System layout' });
  await expect(region).toBeVisible({ timeout: 20_000 });
  const lock = region.getByRole('checkbox', { name: 'Keep selected measures on one system' });
  await expect(lock).not.toBeChecked();
  await lock.click();

  await expect.poll(() => mscxHasLock(page), { timeout: 20_000 }).toBe(true);
  await expect(lock).toBeChecked();
  const locked = await lockState(page);

  await page.keyboard.press('Control+z');
  await expect.poll(() => mscxHasLock(page), { timeout: 20_000 }).toBe(false);
  await expect(lock).not.toBeChecked();
  console.log(`system lock state while locked: ${locked}`);
});
