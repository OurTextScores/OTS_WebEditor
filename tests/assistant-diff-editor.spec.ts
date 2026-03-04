import { expect, test } from '@playwright/test';

const OPENAI_MODELS_RESPONSE = {
  models: ['gpt-test-model'],
};

const SCORE_SESSION_ID = 'sess_assistant_diff_test';

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

const buildThreeNotesXml = (firstStep: string) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <pitch>
          <step>${firstStep}</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const buildDiffFeedbackResponse = (step: string, iteration: number) => ({
  scoreSessionId: SCORE_SESSION_ID,
  baseRevision: iteration,
  iteration,
  patch: {
    format: 'musicxml-patch@1',
    ops: [
      {
        op: 'setText',
        path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
        value: step,
      },
    ],
  },
  proposedXml: buildThreeNotesXml(step),
  feedbackPrompt: `PATCH REVISION FEEDBACK (iteration ${Math.max(0, iteration - 1)})`,
});

const countHighlights = async (page: Parameters<typeof test>[0]['page']) => (
  await page.getByTestId('compare-left-highlight').count()
  + await page.getByTestId('compare-right-highlight').count()
);

const waitForDiffReviewReady = async (page: Parameters<typeof test>[0]['page']) => {
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });
  await expect(page.getByText('Aligning measures...')).toHaveCount(0, { timeout: 20_000 });
};

const openAssistantProposalCompare = async (page: Parameters<typeof test>[0]['page']) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  await page.getByTestId('btn-xml-toggle').click();
  await page.getByTestId('tab-ai').click();
  await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
  await page.getByPlaceholder('Paste your key').fill('test-key');
  await page.getByPlaceholder('Describe the change you want in the MusicXML.').fill('Change the first note to G.');
  await page.getByRole('button', { name: 'Generate Patch' }).click();

  await waitForDiffReviewReady(page);
  await expect(page.getByText('Current vs Assistant Proposal')).toBeVisible();
  await expect(page.getByTestId('compare-pane-right').getByText('Loading checkpoint score...')).toHaveCount(0, { timeout: 20_000 });
};

test.describe('Assistant diff editor flow', () => {
  test.beforeEach(async ({ page }) => {
    let revision = 0;
    await page.route('**/api/llm/openai/models', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(OPENAI_MODELS_RESPONSE) });
    });
    await page.route('**/api/music/scoreops/session/open', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ scoreSessionId: SCORE_SESSION_ID, revision }),
      });
    });
    await page.route('**/api/music/scoreops/sync', async (route) => {
      revision += 1;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ scoreSessionId: SCORE_SESSION_ID, newRevision: revision }),
      });
    });
  });

  test('patch generation opens compare modal and supports accept-all', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });

    await openAssistantProposalCompare(page);

    await expect.poll(async () => (
      await page.getByTestId('compare-left-highlight').count()
      + await page.getByTestId('compare-right-highlight').count()
    ), { timeout: 20_000 }).toBeGreaterThan(0);

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

  test('per-block accept applies the reviewed block immediately', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });

    await openAssistantProposalCompare(page);
    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Accept' }).first().click();

    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBe(0);
  });

  test('per-block reject marks block and leaves score unchanged', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });

    await openAssistantProposalCompare(page);
    const before = await countHighlights(page);
    expect(before).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Reject' }).first().dispatchEvent('click');
    await expect(page.getByRole('button', { name: /Send Feedback \(1 rejection\)/ })).toBeVisible();
    await expect.poll(() => countHighlights(page), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('per-block comment reveals input and stores text', async ({ page }) => {
    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });

    await openAssistantProposalCompare(page);

    await page.getByRole('button', { name: 'Comment' }).first().click();
    const blockComment = page.getByPlaceholder('Describe the revision needed...').first();
    await expect(blockComment).toBeVisible();
    await blockComment.fill('Keep the rhythm, but make this legato.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await expect(page.getByText('Comment attached').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Send Feedback \(1 comment\)/ })).toBeVisible();
  });

  test('send feedback closes diff while request is running and reopens with new proposal', async ({ page }) => {
    let feedbackCalls = 0;
    let lastFeedbackPayload: any = null;
    let releaseFeedback: (() => void) | null = null;
    const feedbackPaused = new Promise<void>((resolve) => {
      releaseFeedback = resolve;
    });

    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });
    await page.route('**/api/music/diff/feedback', async (route) => {
      feedbackCalls += 1;
      lastFeedbackPayload = route.request().postDataJSON();
      await feedbackPaused;
      await route.fulfill({
        status: 200,
        body: JSON.stringify(buildDiffFeedbackResponse('A', 1)),
      });
    });

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Please use A instead.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page.getByRole('button', { name: /Send Feedback/ }).first().click();

    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('ai-diff-feedback-working')).toBeVisible({ timeout: 5_000 });
    releaseFeedback?.();
    await expect.poll(() => feedbackCalls, { timeout: 20_000 }).toBe(1);
    expect(lastFeedbackPayload?.blocks?.[0]?.status).toBe('comment');
    expect(lastFeedbackPayload?.blocks?.[0]?.comment).toContain('use A');
    await waitForDiffReviewReady(page);
    await expect(page.getByTestId('ai-diff-feedback-working')).toHaveCount(0);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder('Describe the revision needed...')).toHaveCount(0);
  });

  test('global comment is sent in diff feedback request', async ({ page }) => {
    let capturedGlobalComment = '';

    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });
    await page.route('**/api/music/diff/feedback', async (route) => {
      const payload = route.request().postDataJSON();
      capturedGlobalComment = String(payload.globalComment || '');
      await route.fulfill({
        status: 200,
        body: JSON.stringify(buildDiffFeedbackResponse('B', 1)),
      });
    });

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Please adjust this phrase.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page.getByPlaceholder('Overall feedback for the next revision...').fill('Overall dynamics are too aggressive.');
    await page.getByRole('button', { name: /Send Feedback/ }).first().click();

    await expect.poll(() => capturedGlobalComment, { timeout: 20_000 }).toContain('dynamics are too aggressive');
  });

  test('diff feedback request carries iteration and advances review state', async ({ page }) => {
    let callCount = 0;
    const requests: any[] = [];

    await page.route('**/api/llm/openai', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify(PATCH_RESPONSE) });
    });
    await page.route('**/api/music/diff/feedback', async (route) => {
      callCount += 1;
      requests.push(route.request().postDataJSON());
      const step = callCount === 1 ? 'A' : 'B';
      await route.fulfill({
        status: 200,
        body: JSON.stringify(buildDiffFeedbackResponse(step, callCount)),
      });
    });

    await openAssistantProposalCompare(page);

    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Round 1: use A.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page.getByRole('button', { name: /Send Feedback/ }).first().click();

    await expect.poll(() => callCount, { timeout: 20_000 }).toBe(1);
    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    expect(requests[0]?.iteration).toBe(0);
  });
});
