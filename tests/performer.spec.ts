import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 1 (docs/private/PERFORMER_MODE_IMPLEMENTATION_PLAN_2026-11-05.md): a score opened at
// /perform, laid out for the screen, locked while performing; pedal keys and taps turn pages; the controls open with
// a long press near the top and change the music's size.

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true }); // an 11" iPad in landscape

const page = (p: Page) => p.getByTestId('performer-page-svg');
const pageIndex = async (p: Page) => Number(await page(p).getAttribute('data-page'));

async function open(p: Page, score = '/test_scores/bach_orig.mscz') {
  await p.goto(`/perform?score=${encodeURIComponent(score)}`);
  await expect(page(p)).toBeVisible({ timeout: 60_000 });
}

test('opens the score locked, and pedal keys turn pages, ignoring a bounce', async ({
  page: p,
}) => {
  await open(p);
  await expect(p.getByTestId('performer-bar')).toHaveCount(0);
  await expect(page(p)).toHaveAttribute('data-page', '0');
  await expect(page(p).locator('svg .Note').first()).toBeAttached();

  await p.keyboard.press('ArrowRight');
  await expect(page(p)).toHaveAttribute('data-page', '1');
  await p.waitForTimeout(400);
  await p.keyboard.press('ArrowLeft');
  await expect(page(p)).toHaveAttribute('data-page', '0');
  await p.waitForTimeout(400);
  // A pedal that sends Page Down, pressed twice at once (a bounce): one turn
  await p.keyboard.press('PageDown');
  await p.keyboard.press('PageDown');
  await expect(page(p)).toHaveAttribute('data-page', '1');
  await p.waitForTimeout(500);
  expect(await pageIndex(p)).toBe(1);
});

test('taps on the right turn forward and on the left third back', async ({ page: p }) => {
  await open(p);
  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await expect(page(p)).toHaveAttribute('data-page', '1');
  await p.waitForTimeout(400);
  await p.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.6);
  await expect(page(p)).toHaveAttribute('data-page', '0');
});

test('a long press near the top opens the controls; larger music takes more pages; Done locks again', async ({
  page: p,
}) => {
  await open(p);
  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + 30);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  const bar = p.getByTestId('performer-bar');
  await expect(bar).toBeVisible();
  // The long press did not also turn the page
  await expect(page(p)).toHaveAttribute('data-page', '0');

  const pages = async () =>
    Number((await p.getByTestId('performer-page').textContent())?.match(/of (\d+)/)?.[1]);
  const before = await pages();
  // Up to twice the size (100 -> 110 -> 125 -> 140 -> 160 -> 180 -> 200%): bach_orig needs more pages there
  for (let i = 0; i < 6; i += 1) await p.getByTestId('performer-larger').click();
  await expect(p.getByTestId('performer-size')).toHaveText('200%');
  await expect.poll(pages, { timeout: 30_000 }).toBeGreaterThan(before);

  await p.getByTestId('performer-done').click();
  await expect(bar).toHaveCount(0);
});

test('rotating the screen lays the score out again for the new shape', async ({ page: p }) => {
  await open(p);
  const svgSize = () =>
    page(p).evaluate((el) => {
      const svg = el.querySelector('svg');
      const [, , w, h] = (svg?.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number);
      return w / h;
    });
  expect(await svgSize()).toBeGreaterThan(1); // landscape page
  await p.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(svgSize, { timeout: 30_000 }).toBeLessThan(1); // portrait page
});

test("chooses a part from the score's parts, and remembers it", async ({ page: p }) => {
  await open(p, '/test_scores/two_staves_parts.mscz'); // Violin and Cello, with a part each
  const staves = () => page(p).locator('svg .StaffLines').count();
  const fullScore = await staves();

  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + 30);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  const part = p.getByTestId('performer-part');
  await expect(part.locator('option')).toHaveText(['Full score', 'Violin', 'Cello']);
  await part.selectOption({ label: 'Cello' });
  // One instrument: fewer staves on the page than the full score's
  await expect.poll(staves, { timeout: 30_000 }).toBeLessThan(fullScore);

  await p.reload();
  await expect(page(p)).toBeVisible({ timeout: 60_000 });
  await expect.poll(staves, { timeout: 30_000 }).toBeLessThan(fullScore);
});

async function openControls(p: Page) {
  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + 30);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await expect(p.getByTestId('performer-bar')).toBeVisible();
}

test('half-page turns: the top of the next page above the bottom of this one, then the next page', async ({
  page: p,
}) => {
  await open(p);
  await openControls(p);
  await p.getByTestId('performer-half-pages').check();
  await p.getByTestId('performer-done').click();
  const view = p.getByTestId('performer');

  await p.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-half', 'true');
  await expect(page(p)).toHaveAttribute('data-page', '0'); // the bottom of page 1, still being played
  await expect(p.getByTestId('performer-next-top')).toHaveAttribute('data-page', '1');
  await expect(p.getByTestId('performer-half-divider')).toBeVisible();
  // The split is between systems: some way down the page, not at an edge
  const top = await p
    .getByTestId('performer-half-divider')
    .evaluate((el) => parseFloat((el as HTMLElement).style.top));
  expect(top).toBeGreaterThan(20);
  expect(top).toBeLessThan(85);

  await p.waitForTimeout(400);
  await p.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-half', 'false');
  await expect(page(p)).toHaveAttribute('data-page', '1');
  await p.waitForTimeout(400);
  await p.keyboard.press('ArrowLeft');
  await expect(page(p)).toHaveAttribute('data-page', '0');
  await expect(view).toHaveAttribute('data-half', 'false');
});

test('a pedal can be taught its key', async ({ page: p }) => {
  await open(p);
  await openControls(p);
  await p.getByTestId('performer-pedals').click();
  await p.getByTestId('pedal-set-next').click();
  await expect(p.getByTestId('pedal-set-next')).toHaveText('Press the pedal…');
  await p.keyboard.press('b');
  await expect(p.getByTestId('pedal-keys-next')).toContainText('b');
  await p.getByTestId('pedal-done').click();
  await p.getByTestId('performer-done').click();
  await p.keyboard.press('b');
  await expect(page(p)).toHaveAttribute('data-page', '1');
});

test('with no score, opens the library', async ({ page: p }) => {
  await p.goto('/perform');
  await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
  await expect(p.getByRole('heading', { name: 'Setlists' })).toBeVisible();
});
