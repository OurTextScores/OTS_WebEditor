import { expect, test } from '@playwright/test';

const OPENAI_MODELS_RESPONSE = {
  models: ['gpt-test-model'],
};

const PATCH_RESPONSE = {
  text: JSON.stringify({
    format: 'musicxml-patch@1',
    ops: [
      {
        op: 'setText',
        path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
        value: 'G',
      },
    ],
  }),
};

test.describe('Assistant diff editor flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/llm/openai/models', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(OPENAI_MODELS_RESPONSE) });
    });
  });

  test('patch generation opens compare modal and supports accept-all', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });

    await page.getByTestId('btn-xml-toggle').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page.getByPlaceholder('Describe the change you want in the MusicXML.').fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });
    await expect(page.getByText('Current vs Assistant Proposal')).toBeVisible();

    await expect.poll(async () => (
      await page.getByTestId('compare-left-highlight').count()
      + await page.getByTestId('compare-right-highlight').count()
    ), { timeout: 20_000 }).toBeGreaterThan(0);

    // Wait for the right-side score to finish loading before clicking Accept All
    await expect(page.getByTestId('compare-pane-right').getByText('Loading checkpoint score...')).toHaveCount(0, { timeout: 20_000 });

    await page.getByRole('button', { name: 'Accept All AI Changes' }).click();

    await expect.poll(async () => (
      await page.getByTestId('compare-left-highlight').count()
      + await page.getByTestId('compare-right-highlight').count()
    ), { timeout: 20_000 }).toBe(0);
  });

  test('invalid patch response shows error and does not open compare modal', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ text: 'not-json' }),
      });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });

    await page.getByTestId('btn-xml-toggle').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page.getByPlaceholder('Describe the change you want in the MusicXML.').fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    await expect(page.getByText('AI response is not valid JSON.').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
  });
});
