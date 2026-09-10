import { describe, expect, it, vi } from 'vitest';
import { renderMusicSnapshot } from '../lib/music-conversion';
import { runMusicRenderService } from '../lib/music-services/render-service';

vi.mock('../lib/music-conversion', () => ({
  renderMusicSnapshot: vi.fn(),
}));

describe('runMusicRenderService', () => {
  it('renders a PNG snapshot from XML content', async () => {
    const mockBuffer = Buffer.from('fake-png-data');
    vi.mocked(renderMusicSnapshot).mockResolvedValue({
      buffer: mockBuffer,
      mimeType: 'image/png',
    });

    const result = await runMusicRenderService({
      content: '<score-partwise>...</score-partwise>',
      format: 'png',
      dpi: 150,
    });

    expect(result.status).toBe(200);
    expect(result.body.format).toBe('png');
    expect(result.body.mimeType).toBe('image/png');
    expect(result.body.dataUrl).toBe('data:image/png;base64,ZmFrZS1wbmctZGF0YQ==');
    expect(renderMusicSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'png',
        dpi: 150,
      }),
    );
  });

  it('returns a 400 result if content is missing', async () => {
    const result = await runMusicRenderService({ content: '' });

    expect(result).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Missing score content, session, or input artifact.',
        },
      },
    });
  });
});
