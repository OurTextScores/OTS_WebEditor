import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const SP = process.env.SP;
const session = readFileSync(`${SP}/session.txt`, 'utf8').trim();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addCookies([
  { name: 'next-auth.session-token', value: session, domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});
page.on('response', async (r) => {
  if (/\/merged\/decisions/.test(r.url())) {
    let body = '';
    try {
      body = (await r.text()).slice(0, 400);
    } catch {}
    console.log(`POST ${r.status()} ${r.url().split('/pages/')[1]}\n  ${body}`);
  }
});
await page.goto(
  'http://localhost:3000/scanner/d9e6d232-21d4-4495-b873-41f6310bc434/pages/1/compare',
  { waitUntil: 'domcontentloaded' },
);
await page.waitForTimeout(32000);
const f = page.frames().find((x) => x.url().includes('score-editor'));
if (!f) {
  console.log('no frame');
  await browser.close();
  process.exit(0);
}
const takes = await f.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="btn-take-up-"]')].map((b) => ({
    id: b.getAttribute('data-testid'),
    text: b.textContent,
  })),
);
console.log('TAKE CONTROLS ' + JSON.stringify(takes));
const target = f.locator('[data-testid="btn-take-up-3"]');
if (await target.count()) {
  // The frame does not scroll; the page does. Put the button in view by
  // scrolling the host to the frame's offset plus the button's own.
  // `boundingBox()` is viewport-relative even inside a frame, so the page has
  // to move by however far down the viewport the button currently sits.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const inner = await target.boundingBox();
    if (!inner) break;
    if (inner.y >= 0 && inner.y < 800) break;
    await page.evaluate((dy) => window.scrollBy(0, dy), inner.y - 300);
    await page.waitForTimeout(400);
  }
  await target.click({ timeout: 15000 });
  await page.waitForTimeout(9000);
} else console.log('btn-take-up-3 not present');
console.log(
  'NOTICE ' +
    JSON.stringify(
      await f
        .locator('[data-testid="merged-status"]')
        .textContent()
        .catch(() => null),
    ),
);
const notice = await f.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(
    (d) => /cannot|could not|refus/i.test(d.textContent || '') && d.children.length === 0,
  );
  return el ? el.textContent.slice(0, 200) : null;
});
console.log('MESSAGE ' + JSON.stringify(notice));
console.log('ERRORS ' + JSON.stringify([...new Set(errors)].slice(0, 4)));
await browser.close();
