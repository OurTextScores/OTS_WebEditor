import { expect, test } from '@playwright/test';

for (const scenario of ['blank'] as const) {
  test(`codec probe on ${scenario}`, async ({ page }) => {
    if (scenario === 'blank') {
      await page.goto('/');
    } else {
      await page.goto('/?score=%2Ftest_scores%2Ftwo_chords.musicxml&embed=player');
      await expect(page.getByTestId('player-seek')).toBeEnabled({ timeout: 60000 });
    }
    for (const codec of ['avc1.42001f', 'vp09.00.10.08', 'av01.0.04M.08']) {
      const result = await page.evaluate(async (name) => {
        if (typeof VideoEncoder === 'undefined') return 'unavailable';
        return await Promise.race([
          VideoEncoder.isConfigSupported({ codec: name, width: 640, height: 480 })
            .then((value) => value.supported ? 'supported' : 'unsupported')
            .catch((error) => `error:${String(error)}`),
          new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
        ]);
      }, codec);
      console.log(`${scenario} ${codec}: ${result}`);
    }
  });
}
