import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 5: setlists. A pedal past the last page offers the next piece; the same pedal again goes.

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const FIRST = '/test_scores/four_measures.musicxml';
const SECOND = '/test_scores/lyrics_repeat_volta.musicxml';
const page = (p: Page) => p.getByTestId('performer-page-svg');

async function waitForScore(p: Page) {
  await expect(page(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
}

test('a setlist made in the library performs piece after piece', async ({ page: p }) => {
  await p.goto('/perform');
  await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
  await p.getByTestId('setlist-new-name').fill('Recital');
  await p.getByTestId('setlist-new').click();
  await expect(p.getByTestId('setlist-editor')).toBeVisible();
  for (const score of [FIRST, SECOND]) {
    await p.getByTestId('setlist-add-link').fill(score);
    await p.getByTestId('setlist-add').click();
  }
  await expect(p.getByTestId('setlist').getByText('2 pieces')).toBeVisible();
  await expect(p.getByTestId('setlist-editor').getByRole('link')).toHaveText([
    'four_measures',
    'lyrics_repeat_volta',
  ]);

  // Kept on the device
  await p.reload();
  await expect(p.getByTestId('setlist').getByText('2 pieces')).toBeVisible({ timeout: 60_000 });
  await p.getByTestId('setlist-perform').click();
  await expect(p).toHaveURL(/setlist=.*item=0/);
  await waitForScore(p);

  // Pedal to the last page and past it: the card, then the next piece
  for (let i = 0; i < 12 && !(await p.getByTestId('setlist-card').count()); i += 1) {
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(350);
  }
  await expect(p.getByTestId('setlist-card')).toContainText('Next: lyrics_repeat_volta');
  await p.waitForTimeout(350);
  await p.keyboard.press('ArrowRight');
  await expect(p).toHaveURL(/item=1/);
  await waitForScore(p);
  await expect(p.getByTestId('setlist-card')).toHaveCount(0);

  // At the start of the second piece, back past it: the previous piece's card; turning forward puts it away
  await p.waitForTimeout(350);
  await p.keyboard.press('ArrowLeft');
  await expect(p.getByTestId('setlist-card')).toContainText('Previous: four_measures');
  await p.getByRole('button', { name: 'Stay' }).click();
  await expect(p.getByTestId('setlist-card')).toHaveCount(0);
});

test('adds the open score to a setlist from the controls', async ({ page: p }) => {
  await p.goto(`/perform?score=${encodeURIComponent(FIRST)}`);
  await waitForScore(p);
  await p.keyboard.press('Escape');
  await expect(p.getByTestId('performer-bar')).toBeVisible();
  await p.getByTestId('add-to-setlist').click();
  await p.getByTestId('add-to-setlist-menu').getByRole('button', { name: 'New setlist' }).click();
  await expect(
    p.getByTestId('performer-bar').getByRole('status').filter({ hasText: 'Added to Setlist' }),
  ).toBeVisible();

  await p.goto('/perform');
  await expect(p.getByTestId('setlist').getByText('1 piece')).toBeVisible({ timeout: 60_000 });
});

test('a setlist made available offline opens its pieces without the network', async ({
  page: p,
}) => {
  await p.goto('/perform');
  await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
  await p.getByTestId('setlist-new-name').fill('Tour');
  await p.getByTestId('setlist-new').click();
  await p.getByTestId('setlist-add-link').fill(FIRST);
  await p.getByTestId('setlist-add').click();
  await expect(p.getByTestId('piece-offline')).toHaveText('Online only');
  await p.getByTestId('setlist-offline').click();
  await expect(p.getByTestId('piece-offline')).toHaveText('On device', { timeout: 30_000 });

  // The score's address no longer answers: the piece comes from the device
  await p.route(`**${FIRST}`, (route) => route.abort());
  await p.getByTestId('setlist-perform').click();
  await waitForScore(p);
});
