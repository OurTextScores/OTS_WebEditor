import { expect, test } from './helpers/diagnostic-test';
import { runCommand } from './helpers/commands';

// What opening a score asks of the engine (roadmap E05): the first page is drawn before any whole-score MusicXML
// export (one takes seconds on a long score: faure's two cost 5.6 s of an 11 s open), the score is not sent to the
// server's score session, and the Score Source panel still shows the MusicXML once it is opened.

type RpcRecord = { method: string; startedAt: number };
const rpcCalls = (page: import('playwright/test').Page) =>
  page.evaluate(
    () =>
      (window as typeof window & { __webmscoreRpcDiagnostics?: { recent: RpcRecord[] } })
        .__webmscoreRpcDiagnostics?.recent ?? [],
  );

test('opening a score draws the first page before any MusicXML export, and sends nothing to the session API', async ({
  page,
}) => {
  const sessionRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/music\/scoreops\/(session\/open|sync)/.test(request.url()))
      sessionRequests.push(request.url());
  });
  await page.goto('/?score=/test_scores/bach_orig.mscz');
  await page
    .locator('[data-testid="svg-container"] svg .Note')
    .first()
    .waitFor({ timeout: 60_000 });
  // Past the old session debounce (1 s). An upload's initial checkpoint exports once, after the first page; a URL load
  // makes none.
  await page.waitForTimeout(4000);
  const calls = await rpcCalls(page);
  const firstSvg = calls.findIndex((call) => call.method === 'saveSvg');
  expect(firstSvg).toBeGreaterThanOrEqual(0);
  expect(calls.slice(0, firstSvg).map((call) => call.method)).not.toContain('saveXml');
  expect(calls.filter((call) => call.method === 'saveXml').length).toBeLessThanOrEqual(1);
  expect(sessionRequests).toEqual([]);
});

test('the Score Source panel loads the MusicXML when it is opened', async ({ page }) => {
  await page.goto('/?score=/test_scores/three_notes_cde.musicxml');
  await page
    .locator('[data-testid="svg-container"] svg .Note')
    .first()
    .waitFor({ timeout: 60_000 });
  await runCommand(page, 'view.panel.scoreSource');
  await expect(page.getByTestId('musicxml-sidebar').first()).toBeVisible();
  await expect(page.getByTestId('xml-editor')).toContainText('<score-partwise', {
    timeout: 30_000,
  });
  // The engine's export, not the file as loaded (the editor shows only the lines in view).
  await expect(page.getByTestId('xml-editor')).toContainText('<software>MuseScore');
});
