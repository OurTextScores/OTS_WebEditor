import { expect, test } from '@playwright/test';

test.describe('embedded score player', () => {
  test('loads a score with a native playback timeline', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=player');

    await expect(page.getByTestId('embedded-score-player')).toBeVisible();
    await expect(page.getByTestId('player-svg').locator('svg')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('player-seek')).toBeEnabled();

    const duration = await page.getByTestId('player-seek').getAttribute('max');
    expect(Number(duration)).toBeGreaterThan(0);
    await expect(page.getByText(/^Page 1 of /)).toBeVisible();

    const fittedWidths = await page.evaluate(() => {
      const viewport = document.querySelector('[data-testid="player-viewport"]') as HTMLElement;
      const svg = document.querySelector('[data-testid="player-svg"] > svg') as SVGElement;
      return {
        available: viewport.clientWidth - 48,
        score: svg.getBoundingClientRect().width,
      };
    });
    expect(Math.abs(fittedWidths.score - fittedWidths.available)).toBeLessThanOrEqual(2);
  });

  test('fits the score and transport without horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player');
    await expect(page.getByTestId('player-svg').locator('svg')).toBeVisible({ timeout: 30_000 });

    const layout = await page.evaluate(() => {
      const viewport = document.querySelector('[data-testid="player-viewport"]') as HTMLElement;
      const svg = document.querySelector('[data-testid="player-svg"] > svg') as SVGElement;
      const controls = document
        .querySelector('[data-testid="player-play"]')
        ?.closest('.sticky') as HTMLElement;
      return {
        expectedScoreWidth: viewport.clientWidth - 24,
        scoreWidth: svg.getBoundingClientRect().width,
        controlsClientWidth: controls.clientWidth,
        controlsScrollWidth: controls.scrollWidth,
      };
    });
    expect(Math.abs(layout.scoreWidth - layout.expectedScoreWidth)).toBeLessThanOrEqual(2);
    expect(layout.controlsScrollWidth).toBeLessThanOrEqual(layout.controlsClientWidth);
  });

  test('keeps the active-measure overlay aligned while zooming', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player');
    await expect(page.getByTestId('active-measure-highlight')).toBeVisible({ timeout: 30_000 });

    const alignmentError = async () =>
      page.evaluate(() => {
        const notation = document.querySelector(
          '[data-testid="player-svg"] > svg',
        ) as SVGSVGElement;
        const highlight = document.querySelector(
          '[data-testid="active-measure-highlight"]',
        ) as SVGRectElement;
        const notationBox = notation.getBoundingClientRect();
        const highlightBox = highlight.getBoundingClientRect();
        const viewBox = notation.viewBox.baseVal;
        const expectedX =
          notationBox.left +
          (Number(highlight.getAttribute('x')) / viewBox.width) * notationBox.width;
        const expectedY =
          notationBox.top +
          (Number(highlight.getAttribute('y')) / viewBox.height) * notationBox.height;
        return Math.max(
          Math.abs(highlightBox.left - expectedX),
          Math.abs(highlightBox.top - expectedY),
        );
      });

    expect(await alignmentError()).toBeLessThan(1);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    expect(await alignmentError()).toBeLessThan(1);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    expect(await alignmentError()).toBeLessThan(1);
  });

  test('keeps embed=1 as a player compatibility alias', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=1');
    await expect(page.getByTestId('embedded-score-player')).toBeVisible();
  });

  test('switches between measure and note highlighting', async ({ page }) => {
    await page.goto('/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player');
    await expect(page.getByTestId('active-measure-highlight')).toBeVisible({ timeout: 30_000 });

    const toggle = page.getByRole('button', { name: 'Note highlighting' }).first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByTestId('active-note-highlight')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await toggle.click();
    await expect(page.getByTestId('active-measure-highlight')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('starts in note mode from the highlight query parameter', async ({ page }) => {
    await page.goto(
      '/?score=%2Ftest_scores%2Fplayback_timeline.musicxml&embed=player&highlight=note',
    );
    await expect(page.getByTestId('active-note-highlight')).toBeVisible({ timeout: 30_000 });
  });

  // `segmentPositions` used to trap on most real scores (note mode then fell back to measures with a message) and gave every
  // note a zero width. These scores are the ones it failed on.
  for (const score of ['bach_orig.mscz', 'single_note_c4.musicxml', 'two_chords.musicxml']) {
    test(`note mode works on ${score}, with a real width`, async ({ page }) => {
      await page.goto(`/?score=%2Ftest_scores%2F${score}&embed=player&highlight=note`);
      const highlight = page.getByTestId('active-note-highlight');
      await expect(highlight).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Note highlighting is unavailable')).toHaveCount(0);
      // A note box is the room layout gave it, not the 12-unit floor.
      expect(Number(await highlight.getAttribute('width'))).toBeGreaterThan(12);
    });
  }

  test('exchanges versioned messages only with the configured parent origin', async ({ page }) => {
    await page.route('**/player-host.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>Player host</title>
                <iframe id="player" title="Hosted score player"></iframe>
                <script>
                    window.__playerEvents = [];
                    window.addEventListener('message', event => window.__playerEvents.push(event.data));
                    document.querySelector('#player').src = '/?score=%2Ftest_scores%2Fbach_orig.mscz&embed=player&playerId=hosted&parentOrigin=' + encodeURIComponent(location.origin);
                </script>`,
      }),
    );
    await page.goto('/player-host.html');

    const iframe = page.getByTitle('Hosted score player').contentFrame();
    await expect(iframe.getByTestId('player-seek')).toBeEnabled({ timeout: 30_000 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as typeof window & { __playerEvents: Array<{ event?: string }> }
          ).__playerEvents.some((event) => event.event === 'ready'),
        ),
      )
      .toBe(true);

    const duration = Number(await iframe.getByTestId('player-seek').getAttribute('max'));
    const target = Math.min(500, duration);
    await iframe.locator('body').evaluate((_, value) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://untrusted.example',
          source: window.parent,
          data: {
            type: 'ots-player:command',
            version: 1,
            playerId: 'hosted',
            command: 'seek',
            value,
          },
        }),
      );
    }, target);
    await expect(iframe.getByTestId('player-seek')).toHaveValue('0');

    const origin = new URL(page.url()).origin;
    await iframe.locator('body').evaluate(
      (_, payload) => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: payload.origin,
            source: window.parent,
            data: {
              type: 'ots-player:command',
              version: 1,
              playerId: 'hosted',
              command: 'seek',
              value: payload.target,
            },
          }),
        );
      },
      { origin, target },
    );
    await expect(iframe.getByTestId('player-seek')).toHaveValue(String(target));

    const eventPayload = await page.evaluate(() =>
      JSON.stringify((window as typeof window & { __playerEvents: unknown[] }).__playerEvents),
    );
    expect(eventPayload).not.toContain('bach_orig.mscz');
  });
});
