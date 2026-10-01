import { createHash } from 'node:crypto';

import { expect, test, type Page, type Route } from '@playwright/test';
import { AI_EDIT_EFFORT_PROFILES, type AiEditEffort } from '../lib/ai-edit-effort';
import { computeMusicXmlIdentityHashServer } from '../lib/musicxml-identity-server';
import { runCommand } from './helpers/commands';
import { applyMusicXmlPatch, type MusicXmlPatch } from '../lib/music-services/patch-service';

const OPENAI_MODELS_RESPONSE = {
  models: ['gpt-test-model'],
};

const SCORE_SESSION_ID = 'sess_assistant_diff_test';
const scoreHash = (xml: string) =>
  `sha256:${createHash('sha256').update(xml, 'utf8').digest('hex')}`;

type FeedbackProposalSession = {
  id?: unknown;
  cycle?: unknown;
  originalInstruction?: unknown;
  previousCycle?: {
    cycle?: unknown;
    patch?: { format?: unknown };
    expectedCurrentContentHash?: unknown;
    baseContentHash?: unknown;
    continuityToken?: unknown;
  };
  constraints?: Array<{ kind?: unknown; text?: unknown }>;
};

type DiffFeedbackRequest = {
  content?: unknown;
  blocks?: Array<{ status?: unknown; comment?: unknown }>;
  editEffort?: unknown;
  iteration?: unknown;
  userEdits?: unknown;
  chatHistory?: unknown;
  proposalSession?: FeedbackProposalSession;
};

const PATCH_RESPONSE: {
  patch: MusicXmlPatch;
  annotations: unknown[];
  verification: {
    level: 'patch_apply';
    attempts: number;
    llmCalls: number;
    elapsedMs: number;
    effort: AiEditEffort;
    budget: typeof AI_EDIT_EFFORT_PROFILES.balanced.patch;
  };
} = {
  patch: {
    format: 'musicxml-patch@1',
    ops: [
      {
        op: 'setText',
        path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
        value: 'G',
      },
    ],
  },
  annotations: [],
  verification: {
    level: 'patch_apply',
    attempts: 1,
    llmCalls: 1,
    elapsedMs: 5,
    effort: 'balanced',
    budget: { ...AI_EDIT_EFFORT_PROFILES.balanced.patch },
  },
};

const E2E_PROPOSAL_SESSION_ID = 'sess-e2e-continuity-1';

const fulfillPatchFromRequestBase = async (route: Route) => {
  const request = route.request().postDataJSON();
  const baseXml = String(request?.content || '');
  const applied = await applyMusicXmlPatch(baseXml, PATCH_RESPONSE.patch);
  expect(applied.error).toBeFalsy();
  expect(applied.xml).toContain('<step>G</step>');
  const baseContentHash = scoreHash(baseXml);
  const baseIdentityHash = computeMusicXmlIdentityHashServer(baseXml);
  await route.fulfill({
    status: 200,
    body: JSON.stringify({
      ...PATCH_RESPONSE,
      proposedXml: applied.xml,
      proposalSessionId: E2E_PROPOSAL_SESSION_ID,
      cycle: 1,
      proposal: {
        sourceTool: 'music.patch',
        baseXml,
        proposedXml: applied.xml,
        baseScoreSessionId: null,
        baseRevision: null,
        baseContentHash,
        expectedCurrentContentHash: baseContentHash,
        baseIdentityHash,
        expectedCurrentIdentityHash: baseIdentityHash,
        proposedContentHash: scoreHash(applied.xml),
        proposedIdentityHash: computeMusicXmlIdentityHashServer(applied.xml),
        verification: PATCH_RESPONSE.verification,
      },
    }),
  });
};

const buildDiffFeedbackResponse = (
  step: string,
  iteration: number,
  baseXml: string,
  options: {
    proposalSessionId?: string;
    previousCycleDropped?: boolean;
    effort?: AiEditEffort;
  } = {},
) => {
  const patch: MusicXmlPatch = {
    format: 'musicxml-patch@1',
    ops: [
      {
        op: 'setText',
        path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]/pitch/step',
        value: step,
      },
    ],
  };
  const proposedXml = baseXml.replace(/<step>\s*C\s*<\/step>/, `<step>${step}</step>`);
  const baseContentHash = scoreHash(baseXml);
  const baseIdentityHash = computeMusicXmlIdentityHashServer(baseXml);
  const verification = {
    level: 'patch_apply',
    attempts: 1,
    llmCalls: 1,
    elapsedMs: 5,
    effort: options.effort ?? 'balanced',
    budget: { ...AI_EDIT_EFFORT_PROFILES[options.effort ?? 'balanced'].patch },
  } as const;
  return {
    scoreSessionId: SCORE_SESSION_ID,
    baseRevision: iteration,
    iteration,
    patch,
    proposedXml,
    proposal: {
      sourceTool: 'music.patch',
      baseXml,
      proposedXml,
      baseScoreSessionId: null,
      baseRevision: null,
      baseContentHash,
      expectedCurrentContentHash: baseContentHash,
      baseIdentityHash,
      expectedCurrentIdentityHash: baseIdentityHash,
      proposedContentHash: scoreHash(proposedXml),
      proposedIdentityHash: computeMusicXmlIdentityHashServer(proposedXml),
      verification,
    },
    proposalSessionId: options.proposalSessionId ?? E2E_PROPOSAL_SESSION_ID,
    cycle: iteration + 1,
    audit: {
      proposalSessionId: options.proposalSessionId ?? E2E_PROPOSAL_SESSION_ID,
      cycle: iteration + 1,
      feedbackCounts: { accepted: 0, rejected: 0, revise: 1, pending: 0 },
      proposalContext: {
        provided: true,
        lineage: options.previousCycleDropped ? 'mismatch' : 'verified',
        previousCycleDropped: Boolean(options.previousCycleDropped),
        truncated: [],
      },
    },
    verification,
    feedbackPrompt: `PATCH REVISION FEEDBACK (iteration ${Math.max(0, iteration - 1)})`,
  };
};

const countHighlights = async (page: Page) =>
  (await page.getByTestId('compare-left-highlight').count()) +
  (await page.getByTestId('compare-right-highlight').count());

const proposalUserEditDiff = (request: { userEdits?: unknown }): string => {
  const edits = request.userEdits;
  if (!Array.isArray(edits)) {
    throw new Error('Expected feedback request to contain userEdits.');
  }
  const proposalEdit = edits.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>).side === 'proposal',
  );
  if (!proposalEdit || typeof proposalEdit.diff !== 'string') {
    throw new Error('Expected feedback request to contain a proposal edit diff.');
  }
  return proposalEdit.diff;
};

const waitForDiffReviewReady = async (page: Page) => {
  await page.getByTestId('checkpoint-compare-modal').waitFor({ timeout: 20_000 });
  await expect(page.getByText('Aligning measures...')).toHaveCount(0, { timeout: 20_000 });
};

const openAssistantProposalCompare = async (
  page: Page,
  options: { effort?: 'efficient' | 'balanced' | 'thorough' } = {},
) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });

  await page.getByTestId('expand-panel-ai-tools').click();
  await page.getByTestId('tab-ai').click();
  await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
  await page.getByPlaceholder('Paste your key').fill('test-key');
  if (options.effort) {
    await page.getByTestId('ai-edit-effort').selectOption(options.effort);
  }
  await page
    .getByPlaceholder('Describe the change you want in the MusicXML.')
    .fill('Change the first note to G.');
  await page.getByRole('button', { name: 'Generate Patch' }).click();

  await waitForDiffReviewReady(page);
  await expect(page.getByText('Current vs Assistant Proposal')).toBeVisible();
  await expect(
    page.getByTestId('compare-pane-right').getByText('Loading checkpoint score...'),
  ).toHaveCount(0, { timeout: 20_000 });
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
    let patchRequest: Record<string, unknown> | null = null;
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.route('**/api/music/patch', async (route) => {
      patchRequest = route.request().postDataJSON();
      const baseXml = String(patchRequest?.content || '');
      const proposalBaseXml = baseXml.replace(
        '<score-partwise',
        '<!-- server serialization -->\n<score-partwise',
      );
      const proposedXml = proposalBaseXml.replace(/<step>\s*C\s*<\/step>/, '<step>G</step>');
      const baseContentHash = scoreHash(proposalBaseXml);
      const baseIdentityHash = computeMusicXmlIdentityHashServer(proposalBaseXml);
      expect(proposedXml).not.toBe(proposalBaseXml);
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          ...PATCH_RESPONSE,
          proposedXml,
          proposal: {
            sourceTool: 'music.patch',
            baseXml: proposalBaseXml,
            proposedXml,
            baseScoreSessionId: null,
            baseRevision: null,
            baseContentHash,
            expectedCurrentContentHash: baseContentHash,
            baseIdentityHash,
            expectedCurrentIdentityHash: baseIdentityHash,
            verification: PATCH_RESPONSE.verification,
          },
        }),
      });
    });

    await openAssistantProposalCompare(page);

    expect(patchRequest).toMatchObject({
      provider: 'openai',
      model: 'gpt-test-model',
      apiKey: 'test-key',
      editEffort: 'balanced',
    });
    const capturedPatchRequest = patchRequest as Record<string, unknown> | null;
    expect(String(capturedPatchRequest?.content)).toContain('<score-partwise');
    expect(String(capturedPatchRequest?.promptText)).toContain('Change the first note to G.');

    await expect
      .poll(
        async () =>
          (await page.getByTestId('compare-left-highlight').count()) +
          (await page.getByTestId('compare-right-highlight').count()),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Apply All AI Changes' }).click();

    await expect
      .poll(
        async () =>
          (await page.getByTestId('compare-left-highlight').count()) +
          (await page.getByTestId('compare-right-highlight').count()),
        { timeout: 20_000 },
      )
      .toBe(0);
    const savedXml = await page.evaluate(async () => {
      const score = (
        window as typeof window & { __webmscore?: { saveXml?: () => Promise<unknown> } }
      ).__webmscore;
      const data = await score?.saveXml?.();
      if (typeof data === 'string') {
        return data;
      }
      if (data instanceof Uint8Array) {
        return new TextDecoder().decode(data);
      }
      return '';
    });
    expect(savedXml).toContain('<step>G</step>');
    expect(pageErrors).toEqual([]);
  });

  test('patch generation shows its budget and can be cancelled', async ({ page }) => {
    let releasePatch: (() => void) | null = null;
    const patchPaused = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });

    await page.route('**/api/music/patch', async (route) => {
      await patchPaused;
      try {
        await fulfillPatchFromRequestBase(route);
      } catch {
        // The browser is expected to close the request after the user cancels it.
      }
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    const working = page.getByTestId('ai-edit-working');
    await expect(working).toBeVisible({ timeout: 5_000 });
    await expect(working).toContainText('Balanced');
    await expect(working).toContainText('up to 2 min');
    await working.getByRole('button', { name: 'Cancel AI edit' }).click();
    (releasePatch as (() => void) | null)?.();

    await expect(working).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
    await expect(page.getByText('Request cancelled.')).toHaveCount(0);
  });

  test('patch generation displays streamed server progress before the terminal result', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes('/api/music/patch') || url.includes('/api/music/patch/deep')) {
          return originalFetch(input, init);
        }
        const encoder = new TextEncoder();
        const event = (name: string, payload: Record<string, unknown>) =>
          encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                event('progress', {
                  version: 'ai-edit-progress@1',
                  type: 'progress',
                  operation: 'patch',
                  sequence: 1,
                  elapsedMs: 5,
                  phase: 'request.accepted',
                  message: 'Request accepted',
                }),
              );
              window.setTimeout(
                () =>
                  controller.enqueue(
                    event('progress', {
                      version: 'ai-edit-progress@1',
                      type: 'progress',
                      operation: 'patch',
                      sequence: 2,
                      elapsedMs: 50,
                      phase: 'candidate.received',
                      message: 'Checking candidate 1 of 3',
                      attempt: 1,
                      maxAttempts: 3,
                      llmCalls: 1,
                    }),
                  ),
                50,
              );
              window.setTimeout(() => {
                controller.enqueue(
                  event('result', {
                    version: 'ai-edit-progress@1',
                    type: 'result',
                    operation: 'patch',
                    sequence: 3,
                    elapsedMs: 1_500,
                    status: 422,
                    body: { error: 'Synthetic stream failure.' },
                  }),
                );
                controller.close();
              }, 1_500);
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream; charset=utf-8' },
          },
        );
      };
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    await expect(page.getByTestId('ai-edit-working')).toContainText('Checking candidate 1 of 3', {
      timeout: 5_000,
    });
    await expect(page.getByText('Synthetic stream failure.').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('ai-edit-working')).toHaveCount(0);
  });

  test('invalid patch response shows error and does not open compare modal', async ({ page }) => {
    await page.route('**/api/music/patch', async (route) => {
      await route.fulfill({
        status: 422,
        body: JSON.stringify({ error: 'AI response is not valid JSON.' }),
      });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });

    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    await expect(page.getByText('AI response is not valid JSON.').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
  });

  test('missing verified patch endpoint does not fall back to a direct LLM proxy', async ({
    page,
  }) => {
    let genericLlmCalls = 0;
    await page.route('**/api/music/patch', async (route) => {
      await route.fulfill({ status: 404, body: '{}' });
    });
    await page.route('**/api/llm/openai', async (route) => {
      genericLlmCalls += 1;
      await route.fulfill({ status: 200, body: JSON.stringify({ text: 'unverified' }) });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByRole('button', { name: 'Generate Patch' }).click();

    await expect(page.getByText('Patch request failed: 404').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
    expect(genericLlmCalls).toBe(0);
  });

  const fulfillPatchWithStaleHashes = async (route: Route) => {
    const request = route.request().postDataJSON();
    const baseXml = String(request?.content || '');
    const applied = await applyMusicXmlPatch(baseXml, PATCH_RESPONSE.patch);
    expect(applied.error).toBeFalsy();
    // Hash a semantically different document, so neither the raw nor the identity hash
    // can match the live score: the Apply gate must refuse.
    const staleBasis = baseXml.replace(/<octave>\s*4\s*<\/octave>/, '<octave>5</octave>');
    expect(staleBasis).not.toBe(baseXml);
    const staleContentHash = scoreHash(staleBasis);
    const staleIdentityHash = computeMusicXmlIdentityHashServer(staleBasis);
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        ...PATCH_RESPONSE,
        proposedXml: applied.xml,
        proposal: {
          sourceTool: 'music.patch',
          baseXml,
          proposedXml: applied.xml,
          baseScoreSessionId: null,
          baseRevision: null,
          baseContentHash: staleContentHash,
          expectedCurrentContentHash: staleContentHash,
          baseIdentityHash: staleIdentityHash,
          expectedCurrentIdentityHash: staleIdentityHash,
          proposedContentHash: scoreHash(applied.xml),
          proposedIdentityHash: computeMusicXmlIdentityHashServer(applied.xml),
          verification: PATCH_RESPONSE.verification,
        },
      }),
    });
  };

  test('stale expected hash blocks Apply All until the proposal is rebased', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchWithStaleHashes);

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Apply All AI Changes' }).click();

    await expect(page.getByTestId('checkpoint-compare-modal').getByRole('alert')).toContainText(
      'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.',
    );
    await expect.poll(() => countHighlights(page), { timeout: 15_000 }).toBeGreaterThan(0);

    // The user still wants the proposal: rebase re-anchors it onto the live score,
    // clears the alert, and Apply All then commits the proposed change.
    await page.getByTestId('btn-rebase-proposal').click();
    await expect(page.getByTestId('checkpoint-compare-modal').getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply All AI Changes' }).click();
    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBe(0);
    const savedXml = await page.evaluate(async () => {
      const score = (
        window as typeof window & { __webmscore?: { saveXml?: () => Promise<unknown> } }
      ).__webmscore;
      const data = await score?.saveXml?.();
      if (typeof data === 'string') {
        return data;
      }
      if (data instanceof Uint8Array) {
        return new TextDecoder().decode(data);
      }
      return '';
    });
    expect(savedXml).toContain('<step>G</step>');
  });

  test('stale expected hash blocks a partial Apply', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchWithStaleHashes);

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect(page.getByTestId('checkpoint-compare-modal').getByRole('alert')).toContainText(
      'The score changed after this proposal was generated. Regenerate or rebase the proposal before applying it.',
    );
    await expect.poll(() => countHighlights(page), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('per-block apply applies the reviewed block immediately', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);

    await openAssistantProposalCompare(page);
    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBeGreaterThan(0);

    const applyButton = page.getByRole('button', { name: 'Apply', exact: true }).first();
    await applyButton.click();

    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBe(0);
  });

  test('per-block reject marks block and leaves score unchanged', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);

    await openAssistantProposalCompare(page);
    const before = await countHighlights(page);
    expect(before).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Reject' }).first().dispatchEvent('click');
    await expect(page.getByRole('button', { name: /Send Feedback \(1 rejection\)/ })).toBeVisible();
    await expect.poll(() => countHighlights(page), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('per-block comment reveals input and stores text', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);

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

  test('send feedback closes diff while request is running and reopens with new proposal', async ({
    page,
  }) => {
    let feedbackCalls = 0;
    const feedbackRequests: DiffFeedbackRequest[] = [];
    let releaseFeedback: (() => void) | null = null;
    const feedbackPaused = new Promise<void>((resolve) => {
      releaseFeedback = resolve;
    });

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      feedbackCalls += 1;
      const feedbackPayload = route.request().postDataJSON() as DiffFeedbackRequest;
      feedbackRequests.push(feedbackPayload);
      await feedbackPaused;
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse('A', 1, String(feedbackPayload.content || ''), {
            effort: 'thorough',
          }),
        ),
      });
    });

    await openAssistantProposalCompare(page, { effort: 'thorough' });
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page
      .getByPlaceholder('Describe the revision needed...')
      .first()
      .fill('Please use A instead.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();

    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('ai-diff-feedback-working')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('ai-diff-feedback-working')).toContainText('Thorough');
    await expect(page.getByTestId('ai-diff-feedback-working')).toContainText('up to 5 min');
    (releaseFeedback as (() => void) | null)?.();
    await expect.poll(() => feedbackCalls, { timeout: 20_000 }).toBe(1);
    expect(feedbackRequests[0]?.blocks?.[0]?.status).toBe('comment');
    expect(feedbackRequests[0]?.blocks?.[0]?.comment).toContain('use A');
    expect(feedbackRequests[0]?.editEffort).toBe('thorough');
    await waitForDiffReviewReady(page);
    await expect(page.getByTestId('ai-diff-feedback-working')).toHaveCount(0);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('Thorough effort');
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('5 min budget');
    await expect(page.getByPlaceholder('Describe the revision needed...')).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply All AI Changes' }).click();
    await expect.poll(() => countHighlights(page), { timeout: 20_000 }).toBe(0);
  });

  test('feedback can be cancelled without losing the current proposal', async ({ page }) => {
    let releaseFeedback: (() => void) | null = null;
    const feedbackRequests: DiffFeedbackRequest[] = [];
    const feedbackPaused = new Promise<void>((resolve) => {
      releaseFeedback = resolve;
    });

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      const payload = route.request().postDataJSON() as DiffFeedbackRequest;
      feedbackRequests.push(payload);
      await feedbackPaused;
      try {
        await route.fulfill({
          status: 200,
          body: JSON.stringify(buildDiffFeedbackResponse('A', 1, String(payload?.content || ''))),
        });
      } catch {
        // The browser is expected to close the request after the user cancels it.
      }
    });

    await openAssistantProposalCompare(page);
    await page.getByTestId('btn-compare-add-bar-right').click();
    const editOnlyFeedback = page.getByRole('button', { name: /Send Feedback \(1 edited score\)/ });
    await expect(editOnlyFeedback).toBeEnabled({ timeout: 20_000 });
    await editOnlyFeedback.click();

    const working = page.getByTestId('ai-diff-feedback-working');
    await expect(working).toBeVisible({ timeout: 5_000 });
    await expect.poll(() => feedbackRequests.length, { timeout: 20_000 }).toBe(1);
    expect(proposalUserEditDiff(feedbackRequests[0])).toContain('measure number="2"');
    await working.getByRole('button', { name: 'Cancel AI edit' }).click();
    (releaseFeedback as (() => void) | null)?.();

    await expect(working).toHaveCount(0, { timeout: 5_000 });
    await waitForDiffReviewReady(page);
    await expect(
      page.getByText(/Assistant Proposal vs Current|Current vs Assistant Proposal/),
    ).toBeVisible();
    await expect(page.getByText('Iteration 1 review')).toBeVisible();
    await expect(page.getByText('Iteration 2 review')).toHaveCount(0);
    await expect(page.getByText(/Diff feedback failed:/)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Send Feedback \(1 edited score\)/ }),
    ).toBeEnabled();
  });

  test('successful edit-only feedback starts a clean proposal baseline', async ({ page }) => {
    const requests: DiffFeedbackRequest[] = [];

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      const payload = route.request().postDataJSON() as DiffFeedbackRequest;
      requests.push(payload);
      const step = requests.length === 1 ? 'A' : 'B';
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse(step, requests.length, String(payload.content || '')),
        ),
      });
    });

    await openAssistantProposalCompare(page);

    // Activation and engine selection alone must not create a manual edit cycle.
    await page.getByTestId('btn-compare-activate-right').click();
    await page.keyboard.press('Control+A');
    await expect(page.getByTestId('compare-selection-overlay-right').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Feedback', exact: true })).toBeDisabled();

    const editProposalAndSend = async () => {
      await page.getByTestId('btn-compare-add-bar-right').click();
      const send = page.getByRole('button', { name: /Send Feedback \(1 edited score\)/ });
      await expect(send).toBeEnabled({ timeout: 20_000 });
      await send.click();
    };

    await editProposalAndSend();
    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(1);
    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });

    await editProposalAndSend();
    await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2);

    const firstDiff = proposalUserEditDiff(requests[0]);
    const secondDiff = proposalUserEditDiff(requests[1]);
    expect(firstDiff).toContain('measure number="2"');
    expect(String(requests[0].content || '')).not.toContain('measure number="2"');
    expect(secondDiff).toContain('measure number="2"');
    // The first generated proposal used G. A stale baseline would make the second
    // cycle report that old G-to-A regeneration as a user edit.
    expect(secondDiff).not.toMatch(/^-\s*<step>G<\/step>$/m);
    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 3 review')).toBeVisible({ timeout: 20_000 });
  });

  test('global comment is sent in diff feedback request', async ({ page }) => {
    let capturedGlobalComment = '';

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      const payload = route.request().postDataJSON();
      capturedGlobalComment = String(payload.globalComment || '');
      await route.fulfill({
        status: 200,
        body: JSON.stringify(buildDiffFeedbackResponse('B', 1, String(payload.content || ''))),
      });
    });

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page
      .getByPlaceholder('Describe the revision needed...')
      .first()
      .fill('Please adjust this phrase.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByPlaceholder('Overall feedback for the next revision...')
      .fill('Overall dynamics are too aggressive.');
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();

    await expect
      .poll(() => capturedGlobalComment, { timeout: 20_000 })
      .toContain('dynamics are too aggressive');
  });

  test('diff feedback request carries iteration and advances review state', async ({ page }) => {
    let callCount = 0;
    const requests: DiffFeedbackRequest[] = [];

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      callCount += 1;
      const payload = route.request().postDataJSON() as DiffFeedbackRequest;
      requests.push(payload);
      const step = callCount === 1 ? 'A' : 'B';
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse(step, callCount, String(payload.content || '')),
        ),
      });
    });

    await openAssistantProposalCompare(page);

    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Round 1: use A.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();

    await expect.poll(() => callCount, { timeout: 20_000 }).toBe(1);
    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    expect(requests[0]?.iteration).toBe(0);
  });

  test('proposal-session continuity flows through consecutive feedback cycles', async ({
    page,
  }) => {
    let callCount = 0;
    const requests: DiffFeedbackRequest[] = [];

    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      callCount += 1;
      const payload = route.request().postDataJSON() as DiffFeedbackRequest;
      requests.push(payload);
      const step = callCount === 1 ? 'A' : 'B';
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse(step, callCount, String(payload.content || '')),
        ),
      });
    });

    await openAssistantProposalCompare(page);
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('Cycle 1', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('apply-verified');

    // Cycle 1 feedback: reject the block and leave a global note.
    await page.getByRole('button', { name: 'Reject' }).first().dispatchEvent('click');
    await page
      .getByPlaceholder('Overall feedback for the next revision...')
      .fill('No slurs anywhere.');
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();
    await expect.poll(() => callCount, { timeout: 20_000 }).toBe(1);
    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('Cycle 2');

    const firstSession = requests[0]?.proposalSession;
    expect(firstSession?.id).toBe(E2E_PROPOSAL_SESSION_ID);
    expect(firstSession?.cycle).toBe(1);
    expect(firstSession?.originalInstruction).toBe('Change the first note to G.');
    expect(firstSession?.previousCycle?.cycle).toBe(1);
    expect(firstSession?.previousCycle?.patch?.format).toBe('musicxml-patch@1');
    expect(
      String(
        firstSession?.previousCycle?.expectedCurrentContentHash ||
          firstSession?.previousCycle?.baseContentHash,
      ),
    ).toMatch(/^sha256:/);
    expect(firstSession?.constraints).toEqual([]);
    expect(requests[0]?.chatHistory).toBeUndefined();

    // Cycle 2 feedback: a comment on the new proposal.
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Round 2: use B.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();
    await expect.poll(() => callCount, { timeout: 20_000 }).toBe(2);
    await waitForDiffReviewReady(page);

    const secondSession = requests[1]?.proposalSession;
    expect(secondSession?.id).toBe(E2E_PROPOSAL_SESSION_ID);
    expect(secondSession?.cycle).toBe(2);
    expect(secondSession?.originalInstruction).toBe('Change the first note to G.');
    expect(secondSession?.previousCycle?.cycle).toBe(2);
    const constraints = secondSession?.constraints ?? [];
    expect(constraints.some((entry) => entry.kind === 'rejected')).toBe(true);
    expect(
      constraints.some((entry) => entry.kind === 'note' && entry.text === 'No slurs anywhere.'),
    ).toBe(true);
  });

  test('deep edit toggle routes to the deep endpoint and surfaces the deep audit', async ({
    page,
  }) => {
    let deepRequest: Record<string, unknown> | null = null;
    let shallowCalls = 0;
    await page.route('**/api/music/patch', async (route) => {
      shallowCalls += 1;
      await route.fulfill({ status: 500, body: '{}' });
    });
    await page.route('**/api/music/patch/deep', async (route) => {
      deepRequest = route.request().postDataJSON();
      const baseXml = String(deepRequest?.content || '');
      const proposedXml = baseXml.replace(/<step>\s*C\s*<\/step>/, '<step>G</step>');
      const baseContentHash = scoreHash(baseXml);
      const baseIdentityHash = computeMusicXmlIdentityHashServer(baseXml);
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          proposal: {
            sourceTool: 'music.deep_edit',
            baseXml,
            proposedXml,
            baseScoreSessionId: null,
            baseRevision: null,
            baseContentHash,
            expectedCurrentContentHash: baseContentHash,
            baseIdentityHash,
            expectedCurrentIdentityHash: baseIdentityHash,
            proposedContentHash: scoreHash(proposedXml),
            proposedIdentityHash: computeMusicXmlIdentityHashServer(proposedXml),
            verification: { level: 'engine_load', llmCalls: 5 },
          },
          proposedXml,
          annotations: [],
          proposalSessionId: E2E_PROPOSAL_SESSION_ID,
          cycle: 1,
          verification: { level: 'engine_load', llmCalls: 5, elapsedMs: 42 },
          deepEdit: {
            finalizedCandidateId: 'cand-2',
            rationale: 'Second candidate rendered cleanly and keeps the voicing.',
            candidates: [
              {
                id: 'cand-1',
                parentId: 'base',
                createdByTool: 'apply_patch',
                verification: 'patch_apply',
                scores: [],
              },
              {
                id: 'cand-2',
                parentId: 'base',
                createdByTool: 'apply_patch',
                verification: 'engine_load',
                scores: [],
              },
            ],
            counters: { llmCalls: 5, toolCalls: 6, renders: 0 },
            elapsedMs: 42,
          },
        }),
      });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByTestId('ai-deep-edit-toggle').check();
    await page.getByRole('button', { name: 'Deep Edit' }).click();

    await waitForDiffReviewReady(page);
    expect(shallowCalls).toBe(0);
    expect(deepRequest).toMatchObject({ provider: 'openai', model: 'gpt-test-model' });
    expect(deepRequest && 'image' in deepRequest).toBe(false);
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('engine-verified');
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('2 candidates');
    await page.getByText('Deep Edit rationale').click();
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('rendered cleanly');
  });

  test('feedback on a deep-edit proposal preserves Phase 2 continuity', async ({ page }) => {
    const deepSessionId = 'sess-deep-continuity-1';
    const deepToken = `pct-v1:${'ab'.repeat(32)}`;
    const feedbackPayloads: DiffFeedbackRequest[] = [];

    await page.route('**/api/music/patch/deep', async (route) => {
      const requestBody = route.request().postDataJSON();
      const baseXml = String(requestBody?.content || '');
      const proposedXml = baseXml.replace(/<step>\s*C\s*<\/step>/, '<step>G</step>');
      const baseContentHash = scoreHash(baseXml);
      const baseIdentityHash = computeMusicXmlIdentityHashServer(baseXml);
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          proposal: {
            sourceTool: 'music.deep_edit',
            baseXml,
            proposedXml,
            baseScoreSessionId: null,
            baseRevision: null,
            baseContentHash,
            expectedCurrentContentHash: baseContentHash,
            baseIdentityHash,
            expectedCurrentIdentityHash: baseIdentityHash,
            proposedContentHash: scoreHash(proposedXml),
            proposedIdentityHash: computeMusicXmlIdentityHashServer(proposedXml),
            verification: { level: 'engine_load', llmCalls: 4 },
          },
          patch: PATCH_RESPONSE.patch,
          proposedXml,
          annotations: [],
          proposalSessionId: deepSessionId,
          cycle: 1,
          continuityToken: deepToken,
          verification: { level: 'engine_load', llmCalls: 4, elapsedMs: 30 },
          deepEdit: {
            finalizedCandidateId: 'cand-1',
            rationale: 'Single verified candidate.',
            candidates: [
              {
                id: 'cand-1',
                parentId: 'base',
                createdByTool: 'apply_patch',
                verification: 'engine_load',
                scores: [],
              },
            ],
            counters: { llmCalls: 4, toolCalls: 3, renders: 0 },
            elapsedMs: 30,
          },
        }),
      });
    });
    await page.route('**/api/music/diff/feedback', async (route) => {
      const feedbackPayload = route.request().postDataJSON() as DiffFeedbackRequest;
      feedbackPayloads.push(feedbackPayload);
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse('A', 1, String(feedbackPayload?.content || ''), {
            proposalSessionId: deepSessionId,
          }),
        ),
      });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByTestId('ai-deep-edit-toggle').check();
    await page.getByRole('button', { name: 'Deep Edit' }).click();
    await waitForDiffReviewReady(page);

    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Use A instead.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();

    await waitForDiffReviewReady(page);
    await expect(page.getByText('Iteration 2 review')).toBeVisible({ timeout: 20_000 });
    const session = feedbackPayloads[0]?.proposalSession;
    expect(session?.id).toBe(deepSessionId);
    expect(session?.cycle).toBe(1);
    expect(session?.originalInstruction).toBe('Change the first note to G.');
    expect(session?.previousCycle?.continuityToken).toBe(deepToken);
    expect(session?.previousCycle?.patch?.format).toBe('musicxml-patch@1');
    await expect(page.getByTestId('ai-proposal-audit')).toContainText('Cycle 2');
  });

  test('new-score deep edit and feedback use the same live MusicXML base', async ({ page }) => {
    let deepRequest: Record<string, unknown> | null = null;
    let feedbackRequest: Record<string, unknown> | null = null;
    const proposalSessionId = 'sess-new-score-live-base';

    await page.route('**/api/music/patch/deep', async (route) => {
      deepRequest = route.request().postDataJSON();
      const baseXml = String(deepRequest?.content || '');
      const patch: MusicXmlPatch = {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'replace',
            path: '/score-partwise/part[1]/measure[@number="1"]/note[1]',
            value:
              '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>',
          },
        ],
      };
      const applied = await applyMusicXmlPatch(baseXml, patch);
      expect(applied.error).toBeFalsy();
      const baseContentHash = scoreHash(baseXml);
      const baseIdentityHash = computeMusicXmlIdentityHashServer(baseXml);
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          patch,
          proposedXml: applied.xml,
          proposalSessionId,
          cycle: 1,
          continuityToken: `pct-v1:${'cd'.repeat(32)}`,
          proposal: {
            sourceTool: 'music.deep_edit',
            baseXml,
            proposedXml: applied.xml,
            baseScoreSessionId: null,
            baseRevision: null,
            baseContentHash,
            expectedCurrentContentHash: baseContentHash,
            baseIdentityHash,
            expectedCurrentIdentityHash: baseIdentityHash,
            proposedContentHash: scoreHash(applied.xml),
            proposedIdentityHash: computeMusicXmlIdentityHashServer(applied.xml),
            verification: { level: 'patch_apply', llmCalls: 2 },
          },
          verification: { level: 'patch_apply', llmCalls: 2, elapsedMs: 10 },
          deepEdit: {
            finalizedCandidateId: 'cand-1',
            rationale: 'Replaced the opening rest with a pitched note.',
            candidates: [
              {
                id: 'cand-1',
                parentId: 'base',
                createdByTool: 'apply_patch',
                verification: 'patch_apply',
                scores: [],
              },
            ],
            counters: { llmCalls: 2, toolCalls: 2, renders: 0 },
            elapsedMs: 10,
          },
        }),
      });
    });
    await page.route('**/api/music/diff/feedback', async (route) => {
      feedbackRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 502,
        body: JSON.stringify({ error: 'deliberate test stop after request capture' }),
      });
    });

    await page.goto('/');
    // File ▸ New Score: the ribbon button moved into the menu under the v2 shell.
    await runCommand(page, 'file.new');
    await page.getByTestId('new-score-modal').waitFor();
    await page.getByRole('button', { name: 'Create Score' }).click();
    await page.waitForSelector('svg .Rest', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Replace the first rest with C4.');
    await page.getByTestId('ai-deep-edit-toggle').check();
    await page.getByRole('button', { name: 'Deep Edit' }).click();
    await waitForDiffReviewReady(page);

    await page
      .getByPlaceholder('Overall feedback for the next revision...')
      .fill('Use D4 instead.');
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();
    await expect.poll(() => feedbackRequest, { timeout: 20_000 }).not.toBeNull();

    const capturedDeepRequest = deepRequest as Record<string, unknown> | null;
    const capturedFeedbackRequest = feedbackRequest as Record<string, unknown> | null;
    const generationBase = String(capturedDeepRequest?.content || '');
    const feedbackBase = String(capturedFeedbackRequest?.content || '');
    expect(feedbackBase).toBe(generationBase);
    expect(computeMusicXmlIdentityHashServer(feedbackBase)).toBe(
      computeMusicXmlIdentityHashServer(generationBase),
    );
  });

  test('deep edit failure shows the typed error and does not open compare', async ({ page }) => {
    await page.route('**/api/music/patch/deep', async (route) => {
      await route.fulfill({
        status: 422,
        body: JSON.stringify({
          error: 'Deep edit ran out of budget before finalizing a candidate.',
          errorCategory: 'budget_exhausted',
        }),
      });
    });

    await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
    await page.waitForSelector('svg .Note', { timeout: 60_000 });
    await page.getByTestId('expand-panel-ai-tools').click();
    await page.getByTestId('tab-ai').click();
    await page.getByPlaceholder('Enter model name').fill('gpt-test-model');
    await page.getByPlaceholder('Paste your key').fill('test-key');
    await page
      .getByPlaceholder('Describe the change you want in the MusicXML.')
      .fill('Change the first note to G.');
    await page.getByTestId('ai-deep-edit-toggle').check();
    await page.getByRole('button', { name: 'Deep Edit' }).click();

    await expect(
      page.getByText('Deep edit ran out of budget before finalizing a candidate.').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('checkpoint-compare-modal')).toHaveCount(0);
  });

  test('dropped previous-cycle context surfaces a warning in the audit line', async ({ page }) => {
    await page.route('**/api/music/patch', fulfillPatchFromRequestBase);
    await page.route('**/api/music/diff/feedback', async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        body: JSON.stringify(
          buildDiffFeedbackResponse('A', 1, String(payload.content || ''), {
            previousCycleDropped: true,
          }),
        ),
      });
    });

    await openAssistantProposalCompare(page);
    await page.getByRole('button', { name: 'Comment' }).first().click();
    await page.getByPlaceholder('Describe the revision needed...').first().fill('Use A.');
    await page.getByRole('button', { name: 'Enter' }).first().click();
    await page
      .getByRole('button', { name: /Send Feedback/ })
      .first()
      .click();

    await waitForDiffReviewReady(page);
    await expect(page.getByTestId('ai-proposal-audit')).toContainText(
      'the previous cycle was not shown to the model',
      { timeout: 20_000 },
    );
  });
});
