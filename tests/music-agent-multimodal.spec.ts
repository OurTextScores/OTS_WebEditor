import { test, expect } from '@playwright/test';

test('Music Agent: can attach files and send multimodal prompt', async ({ page }) => {
  // 1. Navigate to the editor with a sample score
  await page.goto('/?score=/test_scores/single_note_c4.musicxml', { waitUntil: 'networkidle' });
  await page.waitForSelector('svg', { timeout: 20000 });

  // 2. Switch to the Assistant tab and Agent mode
  const assistantTab = page.getByTestId('tab-assistant');
  await expect(assistantTab).toBeVisible();
  await assistantTab.click();

  const agentModeButton = page.getByRole('button', { name: 'Agent' });
  await expect(agentModeButton).toBeVisible();
  await agentModeButton.click();

  // 3. Verify attachments UI is visible
  const attachmentsHeader = page.getByText('Attachments (PDF/Images)');
  await expect(attachmentsHeader).toBeVisible();

  // 4. Mock the API response to avoid real inference
  await page.route('**/api/music/agent', async (route) => {
    const request = route.request();
    const payload = request.postDataJSON();

    // Verify multimodal payload structure
    expect(Array.isArray(payload.prompt)).toBe(true);
    expect(payload.prompt[0]).toMatchObject({ type: 'input_text', text: 'Analyze this PDF' });
    expect(payload.prompt[1]).toMatchObject({ type: 'input_file', filename: 'dummy.pdf' });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'agents-sdk',
        selectedTool: 'music.context',
        toolOk: true,
        response: 'Mocked analysis of the uploaded PDF.',
        result: JSON.stringify({ ok: true, tool: 'music.context' })
      }),
    });
  });

  // 5. Attach a dummy PDF file
  const fileInput = page.getByTestId('input-agent-files');
  await fileInput.setInputFiles({
    name: 'dummy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 dummy content')
  });

  // 6. Verify file appears in the list
  const fileListItem = page.getByText('dummy.pdf');
  await expect(fileListItem).toBeVisible();

  // 7. Enter prompt and send
  const promptArea = page.getByPlaceholder('Describe what you want the agent to do.');
  await promptArea.fill('Analyze this PDF');

  const sendButton = page.getByRole('button', { name: 'Send to Agent' });
  await sendButton.click();

  // 8. Verify the thread updates with the prompt and attachment note
  const thread = page.locator('div[ref="musicAgentThreadRef"]', { hasText: 'Analyze this PDF' }); // This might need a better selector if ref is not an attribute
  // Check the text content directly in the thread area
  const threadArea = page.locator('.overflow-y-auto.rounded.border.bg-gray-50');
  await expect(threadArea).toContainText('Analyze this PDF');
  await expect(threadArea).toContainText('[Attached: dummy.pdf]');

  // 9. Verify the file list is cleared
  await expect(fileListItem).not.toBeVisible();

  // 10. Verify agent response appears
  await expect(threadArea).toContainText('Mocked analysis of the uploaded PDF.');
});
