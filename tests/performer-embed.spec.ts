import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { expect, test, type Page } from './helpers/diagnostic-test';

/**
 * Performer mode, Phase 5: the embed build (`npm run build:embed`, a static export under /score-editor) hosts the
 * perform page as OurTextScores will: perform.html from a plain static server, the app saved for offline use by its
 * service worker. Serves out/ itself, then stops serving for the offline part.
 * Run: `npm run build:embed && PLAYWRIGHT_EMBED=1 npx playwright test tests/performer-embed.spec.ts`.
 */

test.skip(
  process.env.PLAYWRIGHT_EMBED !== '1',
  'needs the embed build in out/ (npm run build:embed)',
);
test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });
test.setTimeout(240_000);

const PORT = Number(process.env.PERFORMER_EMBED_PORT ?? 3122);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = join(process.cwd(), 'out');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.musicxml': 'application/xml',
  '.txt': 'text/plain',
};

/** A static host like OurTextScores': /score-editor/<file> from out/, no rewrites (an extensionless route 404s). */
function serveOut(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', ORIGIN);
    if (!url.pathname.startsWith('/score-editor/')) {
      response.writeHead(404).end();
      return;
    }
    const file = normalize(
      join(OUT, decodeURIComponent(url.pathname.slice('/score-editor/'.length))),
    );
    if (!file.startsWith(OUT) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const notes = (p: Page) => p.getByTestId('performer-page-svg').locator('svg .Note');

test('the embed build performs from perform.html, also with the host gone', async ({ page: p }) => {
  const server = await serveOut();
  const score = encodeURIComponent('/score-editor/test_scores/four_measures.musicxml');
  try {
    await p.goto(`${ORIGIN}/score-editor/perform.html`);
    await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
    await expect(p.getByTestId('offline-app-note')).toHaveText(
      'The app is saved on this device and opens offline.',
      { timeout: 120_000 },
    );
    const manifest = await p.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifest).toBe('/score-editor/perform/manifest.webmanifest');
    expect((await (await fetch(`${ORIGIN}${manifest}`)).json()).start_url).toBe('../perform.html');

    await p.goto(`${ORIGIN}/score-editor/perform.html?score=${score}`);
    await expect(notes(p).first()).toBeAttached({ timeout: 60_000 });
    // The score made available offline through a setlist would be kept; here the page and engine are what matter
    await expect
      .poll(
        () =>
          p.evaluate(async () => {
            const runtime = await caches.open('ots-perform-runtime-v1');
            return Boolean(await runtime.match('/score-editor/webmscore.lib.wasm'));
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
  } finally {
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  }

  // The host gone: the perform app still opens (its library)
  await p.goto(`${ORIGIN}/score-editor/perform.html`);
  await expect(p.getByTestId('performer-library')).toBeVisible({ timeout: 60_000 });
});
