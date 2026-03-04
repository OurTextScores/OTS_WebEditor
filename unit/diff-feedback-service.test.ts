import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicPatchService: vi.fn(),
  resolveProvider: vi.fn((value: unknown) => (typeof value === 'string' ? value : 'openai')),
  parseMusicXmlPatch: vi.fn((text: string) => {
    const payload = JSON.parse(text);
    if (payload?.format === 'musicxml-patch@1' && Array.isArray(payload?.ops)) {
      return { patch: payload, error: '' };
    }
    return { patch: null, error: 'invalid patch' };
  }),
  applyMusicXmlPatch: vi.fn(),
}));

vi.mock('../lib/music-services/patch-service', () => ({
  runMusicPatchService: mocked.runMusicPatchService,
  resolveProvider: mocked.resolveProvider,
  parseMusicXmlPatch: mocked.parseMusicXmlPatch,
  applyMusicXmlPatch: mocked.applyMusicXmlPatch,
}));

import { buildFeedbackPrompt, runDiffFeedbackService } from '../lib/music-services/diff-feedback-service';

describe('diff-feedback-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a structured feedback prompt from block states', () => {
    const prompt = buildFeedbackPrompt({
      iteration: 2,
      blocks: [
        { partIndex: 0, measureRange: '3-4', status: 'accepted' },
        { partIndex: 1, measureRange: '6-6', status: 'rejected' },
        { partIndex: 0, measureRange: '8-9', status: 'comment', comment: 'Keep rhythm, make legato' },
        { partIndex: 0, measureRange: '10-11', status: 'pending' },
      ],
      globalComment: 'Dynamics are too strong',
      chatHistory: [{ role: 'user', text: 'Please soften bars 8-11' }],
    });

    expect(prompt).toContain('PATCH REVISION FEEDBACK (iteration 2)');
    expect(prompt).toContain('ACCEPTED (already applied to current score)');
    expect(prompt).toContain('Part 1, measures 3-4');
    expect(prompt).toContain('REJECTED (do not include in revised patch)');
    expect(prompt).toContain('Part 2, measures 6-6');
    expect(prompt).toContain('REVISE (generate new patch ops for these)');
    expect(prompt).toContain('Keep rhythm, make legato');
    expect(prompt).toContain('GLOBAL NOTE: "Dynamics are too strong"');
  });

  it('runs feedback flow and returns patch plus proposedXml', async () => {
    mocked.runMusicPatchService.mockResolvedValue({
      status: 200,
      body: {
        patch: {
          format: 'musicxml-patch@1',
          ops: [{
            op: 'setText',
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/attributes/key/fifths',
            value: '1',
          }],
        },
        model: 'gpt-5.2',
      },
    });
    mocked.applyMusicXmlPatch.mockResolvedValue({
      xml: '<score-partwise version="4.0"><part-list/></score-partwise>',
      error: '',
    });

    const result = await runDiffFeedbackService({
      content: '<score-partwise version="4.0"></score-partwise>',
      iteration: 2,
      provider: 'openai',
      model: 'gpt-5.2',
      apiKey: 'sk-test',
      blocks: [
        { partIndex: 0, measureRange: '3-4', status: 'accepted' },
        { partIndex: 0, measureRange: '5-6', status: 'pending' },
      ],
      globalComment: 'Keep dynamics gentle',
    });

    expect(mocked.runMusicPatchService).toHaveBeenCalledTimes(1);
    expect(mocked.runMusicPatchService.mock.calls[0][0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.2',
      apiKey: 'sk-test',
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(String(mocked.runMusicPatchService.mock.calls[0][0].prompt)).toContain('ACCEPTED');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      iteration: 3,
      patch: {
        format: 'musicxml-patch@1',
      },
      proposedXml: '<score-partwise version="4.0"><part-list/></score-partwise>',
      model: 'gpt-5.2',
    });
  });

  it('returns 400 for malformed block payloads', async () => {
    const result = await runDiffFeedbackService({
      content: '<score-partwise version="4.0"></score-partwise>',
      blocks: [{ partIndex: -1, measureRange: '', status: 'unknown' }],
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: expect.any(String),
    });
    expect(mocked.runMusicPatchService).not.toHaveBeenCalled();
  });
});
