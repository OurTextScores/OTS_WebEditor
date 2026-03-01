import { describe, expect, it, vi } from 'vitest';
import { renderMusicSnapshot } from '../lib/music-conversion';
import { runMusicRenderService } from '../lib/music-services/render-service';

vi.mock('../lib/music-conversion', () => ({
  renderMusicSnapshot: vi.fn(),
}));

describe('runMusicRenderService', () => {
  it('renders a PNG snapshot from XML content', async () => {
    const mockBuffer = Buffer.from('fake-png-data');
    (renderMusicSnapshot as any).mockResolvedValue({
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
    expect(renderMusicSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      format: 'png',
      dpi: 150,
    }));
  });

  it('fails if content is missing', async () => {
    await expect(runMusicRenderService({ content: '' }))
      .rejects.toThrow('Missing content');
  });
});
