import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runDiffFeedbackService: vi.fn(),
}));

vi.mock('../lib/music-services/diff-feedback-service', () => ({
  runDiffFeedbackService: mocked.runDiffFeedbackService,
}));

import { POST } from '../app/api/music/diff/feedback/route';

describe('POST /api/music/diff/feedback', () => {
  it('returns service response body and status', async () => {
    mocked.runDiffFeedbackService.mockResolvedValue({
      status: 200,
      body: {
        iteration: 3,
        patch: { format: 'musicxml-patch@1', ops: [] },
        proposedXml: '<score-partwise/>',
      },
    });

    const response = await POST(new Request('http://localhost/api/music/diff/feedback', {
      method: 'POST',
      body: JSON.stringify({ scoreSessionId: 'sess_1', baseRevision: 1, blocks: [] }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      iteration: 3,
      patch: { format: 'musicxml-patch@1', ops: [] },
    });
  });

  it('propagates service errors', async () => {
    mocked.runDiffFeedbackService.mockResolvedValue({
      status: 400,
      body: { error: 'blocks must be an array.' },
    });

    const response = await POST(new Request('http://localhost/api/music/diff/feedback', {
      method: 'POST',
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'blocks must be an array.',
    });
  });
});
