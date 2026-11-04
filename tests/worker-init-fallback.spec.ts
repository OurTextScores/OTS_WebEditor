import { expect, test } from 'playwright/test';

test('falls back to the in-process engine when worker initialization fails', async ({ page }) => {
  await page.addInitScript(() => {
    const terminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function () {
      (window as unknown as { __failedWorkerTerminated: boolean }).__failedWorkerTerminated = true;
      return terminate.call(this);
    };
    const OriginalBlob = window.Blob;
    window.Blob = class extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        const patched = parts?.map((part) => {
          if (typeof part !== 'string' || !part.includes("Module.ccall('init')")) return part;
          (window as unknown as { __injectedInitFailure: boolean }).__injectedInitFailure = true;
          return part.replace("Module.ccall('init')", "(() => { throw new Error('injected worker init failure') })()");
        });
        super(patched, options);
      }
    };
  });
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await expect(page.locator('svg .Note').first()).toBeVisible({ timeout: 90_000 });
  expect(await page.evaluate(() => (window as unknown as { __injectedInitFailure?: boolean }).__injectedInitFailure)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __failedWorkerTerminated?: boolean }).__failedWorkerTerminated)).toBe(true);
  expect(warnings.some((message) => message.includes('Worker webmscore load failed'))).toBe(true);
});
