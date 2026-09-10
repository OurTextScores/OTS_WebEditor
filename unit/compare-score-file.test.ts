import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  loadWebMscore: vi.fn(),
  loadWebMscoreInProcess: vi.fn(),
}));

// Only the loaders are faked. `decodeScoreXml` is real logic worth exercising
// here rather than stubbing — it is what turns whatever the engine returned
// into the MusicXML this function promises.
vi.mock('../lib/webmscore-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webmscore-loader')>()),
  loadWebMscore: mocked.loadWebMscore,
  loadWebMscoreInProcess: mocked.loadWebMscoreInProcess,
}));

import { loadCompareScoreMusicXml } from '../lib/compare-score-file';

describe('loadCompareScoreMusicXml', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    mocked.loadWebMscoreInProcess.mockReset();
  });

  it('reads MusicXML files without starting the score engine', async () => {
    const xml = '<score-partwise version="4.0"/>';
    await expect(
      loadCompareScoreMusicXml(new File([xml], 'left.musicxml', { type: 'application/xml' })),
    ).resolves.toBe(xml);
    expect(mocked.loadWebMscore).not.toHaveBeenCalled();
  });

  it('converts packaged scores to MusicXML and destroys the temporary score', async () => {
    const xml = '<score-partwise version="4.0"/>';
    const temporaryScore = {
      saveXml: vi.fn(async () => new TextEncoder().encode(xml)),
      destroy: vi.fn(),
    };
    const load = vi.fn(async () => temporaryScore);
    mocked.loadWebMscore.mockResolvedValue({ load, ready: Promise.resolve() });

    const result = await loadCompareScoreMusicXml(
      new File([new Uint8Array([1, 2, 3])], 'left.mscz'),
    );

    expect(result).toBe(xml);
    expect(load).toHaveBeenCalledWith('mscz', expect.any(Uint8Array), [], false);
    expect(temporaryScore.destroy).toHaveBeenCalledOnce();
  });
});
