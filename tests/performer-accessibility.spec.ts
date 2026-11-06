import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 6: controls a finger can hit, VoiceOver can reach, and a page that can be read on a dim stage.

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const SCORE = '/test_scores/bach_orig.mscz';
const pageSvg = (p: Page) => p.getByTestId('performer-page-svg');

async function open(p: Page) {
  await p.goto(`/perform?score=${encodeURIComponent(SCORE)}`);
  await expect(pageSvg(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
}

test('the controls are a labelled toolbar with finger-sized targets', async ({ page: p }) => {
  await open(p);
  await p.keyboard.press('Escape');
  const bar = p.getByRole('toolbar', { name: 'Performer controls' });
  await expect(bar).toBeVisible();
  const small = await bar.locator('button, select').evaluateAll((controls) =>
    controls
      .map((control) => ({
        label: control.textContent?.trim() || control.getAttribute('aria-label'),
        box: control.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(({ label, box }) => `${label}: ${Math.round(box.width)}x${Math.round(box.height)}`),
  );
  expect(small).toEqual([]);
});

// Activated as VoiceOver and Full Keyboard Access do: focused, then Enter (out of sight, so not clickable)
test('VoiceOver can turn pages and hears where it is', async ({ page: p }) => {
  await open(p);
  await p.getByRole('button', { name: 'Next page' }).press('Enter');
  await expect(pageSvg(p)).toHaveAttribute('data-page', '1');
  await expect(p.getByTestId('performer-page-announce')).toHaveText(/^Page 2 of \d+$/);
  await p.waitForTimeout(350);
  await p.getByRole('button', { name: 'Previous page' }).press('Enter');
  await expect(pageSvg(p)).toHaveAttribute('data-page', '0');
  await p.getByRole('button', { name: 'Show controls' }).press('Enter');
  await expect(p.getByTestId('performer-bar')).toBeVisible();
});

test('the dark display inverts the page and is remembered on the device', async ({ page: p }) => {
  await open(p);
  await p.keyboard.press('Escape');
  await p.getByTestId('performer-display').selectOption('dark');
  await expect(p.getByTestId('performer')).toHaveAttribute('data-display', 'dark');
  await expect
    .poll(() => pageSvg(p).evaluate((layer) => getComputedStyle(layer).filter))
    .toContain('invert');
  await p.reload();
  await expect(pageSvg(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
  await expect(p.getByTestId('performer')).toHaveAttribute('data-display', 'dark');
});

test('asks for more contrast: high contrast from the start', async ({ page: p }) => {
  await p.emulateMedia({ contrast: 'more' });
  await open(p);
  await expect(p.getByTestId('performer')).toHaveAttribute('data-display', 'high-contrast');
  await expect
    .poll(() => pageSvg(p).evaluate((layer) => getComputedStyle(layer).filter))
    .toContain('contrast');
});
