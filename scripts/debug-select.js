const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (msg) => console.log('PAGE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message, err.stack));
  page.on('requestfailed', (req) =>
    console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText),
  );
  await page.goto('http://localhost:3000/?score=/test_scores/bach_orig.mscz', {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('.Note');
  const note = await page.$('.Note');
  await note.scrollIntoViewIfNeeded();
  const box = await note.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);

  const countNotes = () => page.evaluate(() => document.querySelectorAll('.Note').length);

  // reselect via WASM to ensure selection
  const selectResult = await page.evaluate((b) => {
    const svg = document.querySelector('svg');
    const container = svg?.parentElement;
    if (!container || !window.__webmscore?.selectElementAtPoint) return null;
    const containerRect = container.getBoundingClientRect();
    const x = b.x - containerRect.left + b.width / 2;
    const y = b.y - containerRect.top + b.height / 2;
    return window.__webmscore.selectElementAtPoint(0, x, y);
  }, box);
  console.log('selectElementAtPoint result', selectResult);
  const svgBefore = await page.evaluate(async () => {
    const svg = await window.__webmscore.saveSvg(0, true);
    return svg;
  });
  console.log('svg length before pitch', svgBefore.length);
  console.log('svg snippet before pitch', svgBefore.slice(0, 200).replace(/\s+/g, ' '));
  const hasSelBefore = svgBefore.includes('selstate');
  console.log('svgHasSelState before pitch', hasSelBefore);

  const runMutation = async (label, buttonText) => {
    console.log(`\n=== ${label} ===`);
    const notesBefore = await countNotes();
    await page.click(`text="${buttonText}"`);
    await page.waitForTimeout(600);
    const notesAfter = await countNotes();
    const svg = await page.evaluate(async () => window.__webmscore.saveSvg(0, true));
    console.log('notes before/after', notesBefore, notesAfter);
    console.log('svg length', svg.length);
    console.log('has selected class?', svg.includes('selected'));
    return { notesBefore, notesAfter, svg };
  };

  await runMutation('Pitch Up', 'Pitch ↑');
  await runMutation('Duration Longer', 'Longer');
  await runMutation('Duration Shorter', 'Shorter');
  await runMutation('Undo', 'Undo');
  await runMutation('Redo', 'Redo');
  await runMutation('Delete Selection', 'Delete');

  await browser.close();
})();
