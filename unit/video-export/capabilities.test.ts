import { describe, expect, it } from 'vitest';
import { chooseFormat, maxInMemorySeconds } from '../../lib/video-export/capabilities';

describe('chooseFormat', () => {
  it('prefers MP4 with H.264 and AAC', () => {
    expect(chooseFormat({ video: ['vp9', 'avc'], audio: ['opus', 'aac'] })).toMatchObject({
      ok: true,
      container: 'mp4',
      video: 'avc',
      audio: 'aac',
      extension: 'mp4',
    });
  });

  it('falls back to WebM with Opus when AAC cannot be encoded (this Linux Chromium)', () => {
    expect(chooseFormat({ video: ['avc', 'vp9', 'av1'], audio: ['opus'] })).toMatchObject({
      ok: true,
      container: 'webm',
      video: 'vp9',
      audio: 'opus',
      mimeType: 'video/webm',
    });
  });

  it('uses AV1 for WebM when VP9 is missing', () => {
    expect(chooseFormat({ video: ['av1'], audio: ['opus'] })).toMatchObject({
      ok: true,
      video: 'av1',
    });
  });

  it('does not pair H.264 with Opus in MP4', () => {
    expect(chooseFormat({ video: ['avc'], audio: ['opus'] })).toMatchObject({ ok: false });
  });

  it('says why when nothing works', () => {
    const none = chooseFormat({ video: [], audio: [] });
    expect(none).toMatchObject({ ok: false });
    expect(none.ok === false && none.reason).toMatch(/WebCodecs/);
    const noAudio = chooseFormat({ video: ['vp9'], audio: [] });
    expect(noAudio.ok === false && noAudio.reason).toMatch(/audio/);
  });
});

describe('maxInMemorySeconds', () => {
  it('scales with the bitrate', () => {
    const slow = maxInMemorySeconds(1_500_000, 128_000);
    const fast = maxInMemorySeconds(6_000_000, 128_000);
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBe(Math.floor((400 * 1024 * 1024) / ((1_500_000 + 128_000) / 8)));
  });
});
