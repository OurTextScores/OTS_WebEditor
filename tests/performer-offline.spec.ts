import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from './helpers/diagnostic-test';

/**
 * Performer mode, Phase 5: the perform app and a setlist made available offline open with no network. The service
 * worker is production-only (the dev server's build files are not content-hashed), so this starts its own production
 * server on the last build (`npm run build` first) and, for the offline part, stops it: a real outage, the same in
 * every browser (Playwright's WebKit offline emulation fails requests before the service worker sees them).
 * Run: `npm run build && PLAYWRIGHT_PROD=1 npx playwright test tests/performer-offline.spec.ts`.
 */

test.skip(
  process.env.PLAYWRIGHT_PROD !== '1',
  'needs a production build (the service worker is production-only)',
);
test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });
test.setTimeout(240_000);

const PORT = Number(process.env.PERFORMER_OFFLINE_PORT ?? 3121);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SCORE = '/test_scores/four_measures.musicxml';
const notes = (p: Page) => p.getByTestId('performer-page-svg').locator('svg .Note');

async function startServer(): Promise<ChildProcess> {
  const server = spawn(
    'npx',
    ['next', 'start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true,
    },
  );
  for (let i = 0; i < 120; i += 1) {
    const up = await fetch(`${ORIGIN}/perform-sw.js`)
      .then((response) => response.ok)
      .catch(() => false);
    if (up) return server;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('the production server did not start');
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null || !server.pid) return;
  const exited = new Promise((resolve) => server.once('exit', resolve));
  process.kill(-server.pid, 'SIGTERM'); // its process group: npx and next
  await exited;
  for (let i = 0; i < 40; i += 1) {
    const down = await fetch(`${ORIGIN}/perform-sw.js`)
      .then(() => false)
      .catch(() => true);
    if (down) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

test('a setlist made available offline performs with the server gone', async ({ page: p }) => {
  const server = await startServer();
  try {
    await p.goto(`${ORIGIN}/perform`);
    await expect(p.getByTestId('offline-app-note')).toHaveText(
      'The app is saved on this device and opens offline.',
      { timeout: 120_000 },
    );
    await p.getByTestId('setlist-new-name').fill('Airplane');
    await p.getByTestId('setlist-new').click();
    await p.getByTestId('setlist-add-file-input').setInputFiles(`public${SCORE}`);
    await p.getByTestId('setlist-offline').click();
    await expect(p.getByTestId('piece-offline')).toHaveText('On device', { timeout: 30_000 });

    // Performed once online: the perform view's build files are fetched (and kept)
    await p.getByTestId('setlist-perform').click();
    await expect(notes(p).first()).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(
        () =>
          p.evaluate(async () => {
            const runtime = await caches.open('ots-perform-runtime-v1');
            const engine = await Promise.all(
              ['/webmscore.lib.js', '/webmscore.lib.wasm', '/webmscore.lib.data'].map((url) =>
                runtime.match(url),
              ),
            );
            const staticFiles = await (await caches.open('ots-perform-static-v1')).keys();
            return engine.every(Boolean) && staticFiles.length > 0;
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
  } finally {
    await stopServer(server);
  }

  // No server: the library and the piece still open
  await p.goto(`${ORIGIN}/perform`);
  await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
  await p.getByTestId('setlist-perform').click();
  await expect(notes(p).first()).toBeAttached({ timeout: 60_000 });
});
