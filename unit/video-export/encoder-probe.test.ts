import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ video: vi.fn(), audio: vi.fn() }));
vi.mock('mediabunny', () => ({
  getFirstEncodableVideoCodec: mocks.video,
  getFirstEncodableAudioCodec: mocks.audio,
}));

import { probeEncoders } from '../../lib/video-export/mediabunnySink';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('initializes the media stack before testing actual WebCodecs support', async () => {
  let warmed = false;
  vi.stubGlobal('VideoEncoder', class {});
  vi.stubGlobal('AudioEncoder', undefined);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('video');
      return { canPlayType: () => { warmed = true; return ''; } };
    },
  });
  mocks.video.mockImplementation(async ([codec]: string[]) => {
    expect(warmed).toBe(true);
    return codec === 'vp9' ? codec : null;
  });

  expect(await probeEncoders({ width: 640, height: 480 })).toEqual({ video: ['vp9'], audio: [] });
  expect(mocks.video).toHaveBeenCalledTimes(3);
});
