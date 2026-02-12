import { expect, test, Page } from '@playwright/test';

const SCORE_URL = '/?score=/test_scores/single_note_c4.musicxml';
const MULTI_SCORE_URL = '/?score=/test_scores/three_notes_cde.musicxml';

async function installAuditionSpy(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).__webmscore), { timeout: 30_000 });

  await page.evaluate(() => {
    const g = window as any;
    const score = g.__webmscore;
    if (!score) {
      throw new Error('window.__webmscore is not available');
    }

    g.__auditionPreviewCalls = [];

    if (!g.__auditionFetchPatched) {
      const originalFetch = window.fetch.bind(window);
      g.__auditionOriginalFetch = originalFetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
        if (/\.(sf2|sf3)(\?|$)/i.test(url)) {
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }
        return originalFetch(input as any, init);
      };
      g.__auditionFetchPatched = true;
    }

    score.setSoundFont = async () => {};

    score.synthSelectionPreviewBatch = async (...args: any[]) => {
      g.__auditionPreviewCalls.push(args);
      const chunk = new Uint8Array(512 * 4);
      return async (cancel?: boolean) => {
        if (cancel) {
          return [];
        }
        return [{
          chunk,
          startTime: 0,
          endTime: 0.05,
          done: true,
        }];
      };
    };
  });
}

function maybeAttachDebugConsole(page: Page) {
  if (process.env.DEBUG_AUDITION_TESTS !== '1') {
    return;
  }
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[AUDITION]') || text.includes('[AUDIO]') || text.includes('Mutation "raise pitch"')) {
      // eslint-disable-next-line no-console
      console.log(`[browser] ${text}`);
    }
  });
}

test('selection requests audition preview stream', async ({ page }) => {
  maybeAttachDebugConsole(page);
  await page.goto(SCORE_URL);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await installAuditionSpy(page);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });

  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length);
  }, { timeout: 10_000 }).toBeGreaterThan(0);

  const firstArgs = await page.evaluate(() => (window as any).__auditionPreviewCalls[0] as number[]);
  expect(firstArgs[0]).toBe(1);
  expect(firstArgs[1]).toBe(350);
});

test('mutation requests audition preview stream', async ({ page }) => {
  maybeAttachDebugConsole(page);
  await page.goto(SCORE_URL);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await installAuditionSpy(page);

  await page.locator('svg .Note').first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as any).__auditionPreviewCalls = [];
  });
  await page.getByTestId('btn-pitch-up').click();

  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(0);
});

test('repeated note selections request audition preview each time', async ({ page }) => {
  maybeAttachDebugConsole(page);
  await page.goto(MULTI_SCORE_URL);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await installAuditionSpy(page);

  const notes = page.locator('svg .Note');
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(0);

  const afterFirst = await page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  await notes.nth(1).click();
  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(afterFirst);

  const afterSecond = await page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  await notes.nth(2).click();
  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(afterSecond);
});

test('range selection remains intact with audition enabled', async ({ page }) => {
  maybeAttachDebugConsole(page);
  await page.goto(MULTI_SCORE_URL);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  await installAuditionSpy(page);

  const readXml = async (): Promise<string> => {
    return page.evaluate(async () => {
      const score = (window as any).__webmscore;
      if (!score?.saveXml) {
        throw new Error('window.__webmscore.saveXml is not available');
      }
      return score.saveXml();
    });
  };

  const notes = page.locator('svg .Note');
  await notes.nth(0).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  await notes.nth(1).click({ modifiers: ['Shift'] });
  await page.waitForTimeout(300);

  await expect.poll(async () => {
    return page.evaluate(() => (window as any).__auditionPreviewCalls.length as number);
  }, { timeout: 10_000 }).toBeGreaterThan(0);

  await page.keyboard.press('Control+C');
  await notes.nth(2).click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 10_000 });
  const xmlBeforePaste = await readXml();
  await page.keyboard.press('Control+V');
  await expect.poll(async () => await readXml(), { timeout: 20_000 }).not.toBe(xmlBeforePaste);
});
