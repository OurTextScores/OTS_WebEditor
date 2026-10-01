import { expect, test } from 'playwright/test';
import { runCommand } from './helpers/commands';

type NoteEntryWindow = typeof window & {
  __webmscore?: { saveXml?: () => Promise<Uint8Array> };
};

/**
 * Note-input duration behavior against real WASM.
 *
 * These two cases — "7D7D produces two whole notes" and "7D5D produces one whole note
 * and one quarter note" — were unconditionally skipped for the whole technical-debt
 * sprint with TD-07 L2 as their owner, because they read `window.__webmscore` and L2 was
 * going to gate it. With the handle gated to non-production and these running against
 * `next dev`, they are enabled again, and both of their original intents pass.
 *
 * Two things had to be corrected first, and neither was a product defect:
 *
 *   1. stale selectors — the control is `btn-note-input` with `aria-pressed`, not
 *      `btn-note-entry` with `aria-checked`;
 *   2. a fixture that could not satisfy them. `three_notes_cde.musicxml` is a 4/4 measure
 *      holding three quarter notes, so the measure is incomplete and a whole note entered
 *      at beat 1 is clamped — "two whole notes" is unreachable there whatever the product
 *      does. `four_measures.musicxml` is four complete bars of one whole note each, where
 *      a whole note fits exactly and a shorter entry visibly splits its bar.
 *
 * Assertions read pitch *and* duration. Duration alone cannot see consecutive entry: two
 * consecutive half notes leave the duration list unchanged while the pitches differ, which
 * is exactly how a healthy engine can be mistaken for a broken one.
 */
const FIXTURE = '/?score=/test_scores/four_measures.musicxml';

const openScore = async (page: import('playwright/test').Page) => {
  await page.goto(FIXTURE);
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  // The first render has to settle before the note is stable enough to click.
  await page.waitForTimeout(1_500);
};

/** Pitches and durations in document order, from the engine's own MusicXML export. */
const contents = async (page: import('playwright/test').Page) =>
  page.evaluate(async () => {
    const score = (window as NoteEntryWindow).__webmscore;
    if (!score?.saveXml) {
      throw new Error('window.__webmscore.saveXml is not available');
    }
    const raw = (await score.saveXml()) as unknown;
    const xml = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);
    return {
      steps: [...xml.matchAll(/<step>([A-G])<\/step>/g)].map((match) => match[1]).join(''),
      types: [...xml.matchAll(/<type>(\w+)<\/type>/g)].map((match) => match[1]),
    };
  });

const startNoteInput = async (page: import('playwright/test').Page) => {
  const box = await page.locator('svg .Note').first().boundingBox();
  if (!box) {
    throw new Error('Expected a clickable note in the fixture.');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId('selection-overlay').waitFor({ timeout: 20_000 });
  await runCommand(page, 'btn-note-input');
  await expect(page.getByTestId('btn-note-input')).toHaveAttribute('aria-pressed', 'true');
};

test('enters a note at the duration chosen with the number keys', async ({ page }) => {
  await openScore(page);
  expect(await contents(page)).toEqual({
    steps: 'FACE',
    types: ['whole', 'whole', 'whole', 'whole'],
  });

  await startNoteInput(page);
  await page.keyboard.press('5');
  await page.keyboard.press('d');

  // A quarter at beat 1 replaces the head of bar 1 and leaves quarter + half behind it,
  // both still sounding the bar's original F.
  await expect
    .poll(async () => contents(page), { timeout: 20_000 })
    .toEqual({
      steps: 'DFFACE',
      types: ['quarter', 'quarter', 'half', 'whole', 'whole', 'whole'],
    });
});

test('preserves the chosen duration across consecutive entries', async ({ page }) => {
  // The original "7D7D produces two whole notes". A whole note fills a bar here, so the
  // engine advances to the next bar and the second D lands there.
  await openScore(page);
  await startNoteInput(page);

  await page.keyboard.press('7');
  await page.keyboard.press('d');
  await expect
    .poll(async () => contents(page), { timeout: 20_000 })
    .toEqual({
      steps: 'DACE',
      types: ['whole', 'whole', 'whole', 'whole'],
    });

  await page.keyboard.press('7');
  await page.keyboard.press('d');
  await expect
    .poll(async () => contents(page), { timeout: 20_000 })
    .toEqual({
      steps: 'DDCE',
      types: ['whole', 'whole', 'whole', 'whole'],
    });
});

test('applies a duration change made between entries', async ({ page }) => {
  // The original "7D5D produces one whole note and one quarter note".
  await openScore(page);
  await startNoteInput(page);

  await page.keyboard.press('7');
  await page.keyboard.press('d');
  await expect
    .poll(async () => contents(page), { timeout: 20_000 })
    .toMatchObject({ types: ['whole', 'whole', 'whole', 'whole'] });

  await page.keyboard.press('5');
  await page.keyboard.press('d');

  // Bar 1 keeps its whole D; bar 2 takes a quarter D and splits the rest of its bar.
  await expect
    .poll(async () => contents(page), { timeout: 20_000 })
    .toEqual({
      steps: 'DDAACE',
      types: ['whole', 'quarter', 'quarter', 'half', 'whole', 'whole'],
    });
});
