import { test, expect } from '@playwright/test';

test.describe('Music Agent: Score Sessions & Persistence', () => {
  test('Agent perceives score changes across multiple turns via the same scoreSessionId', async ({ page }) => {
    const sessionId = 'persistent-session-id';
    let serverXml = '<score-partwise><work><work-title>Original Title</work-title></work></score-partwise>';

    // 1. Mock Session Open/Sync
    await page.route('**/api/music/scoreops/session/open', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ scoreSessionId: sessionId, revision: 0 }) });
    });

    await page.route('**/api/music/scoreops/sync', async (route) => {
      const json = route.request().postDataJSON();
      if (json.content) serverXml = json.content; // Capture synced XML
      await route.fulfill({ status: 200, body: JSON.stringify({ scoreSessionId: sessionId, newRevision: 1 }) });
    });

    // 2. Mock Agent responses based on the current 'serverXml'
    await page.route('**/api/music/agent', async (route) => {
      const payload = route.request().postDataJSON();
      const prompt = payload.prompt;
      
      // Verification: Ensure prompt is text string for SDK run()
      expect(typeof prompt).toBe('string');
      // Verification: Ensure scoreSessionId is passed in toolInput defaults
      expect(payload.toolInput.context.scoreSessionId).toBe(sessionId);

      let responseText = '';
      if (prompt.includes('title')) {
         const titleMatch = serverXml.match(/<work-title>(.*?)<\/work-title>/);
         responseText = `The title is ${titleMatch ? titleMatch[1] : 'unknown'}.`;
      }

      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          mode: 'agents-sdk',
          selectedTool: 'music.context',
          response: responseText,
          result: JSON.stringify({ ok: true, body: { scoreSessionId: sessionId, revision: 0 } })
        }),
      });
    });

    // EXECUTION
    // 3. Initial load
    await page.goto('/?score=/test_scores/single_note_c4.musicxml', { waitUntil: 'networkidle' });
    await page.waitForSelector('svg');

    // 4. Turn 1: Ask about current title
    // 3. Switch to Assistant tab -> Agent mode
    await page.getByTestId('tab-assistant').click();
    await page.getByRole('button', { name: 'Agent' }).click();

    await page.getByPlaceholder('Describe what you want the agent to do.').fill('What is the title?');
    await page.getByRole('button', { name: 'Send to Agent' }).click();
    // Verify first response
    const thread = page.locator('.overflow-y-auto.rounded.border.bg-gray-50');
    await expect(thread).toContainText('The title is Original Title.', { timeout: 15000 });

    // 5. Simulate Server-side change (e.g., via sync)
    // We update our local mock variable which the next agent call will "see" via the session ID
    serverXml = '<score-partwise><work><work-title>New Updated Title</work-title></work></score-partwise>';

    // 6. Turn 2: Ask again
    await page.getByPlaceholder('Describe what you want the agent to do.').fill('What is the title now?');
    await page.getByRole('button', { name: 'Send to Agent' }).click();

    // Verify second response shows the NEW title, proving persistence via session ID
    await expect(thread).toContainText('The title is New Updated Title.', { timeout: 15000 });
  });
});
