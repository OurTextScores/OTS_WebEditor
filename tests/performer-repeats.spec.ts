import { expect, test, type Page } from './helpers/diagnostic-test';

// Performer mode, Phase 3: tap a repeat sign to go where the music goes next; the Play-through view writes the
// repeats out. On lyrics_repeat_volta.musicxml: bar 2 is a first ending ending in an end-repeat, bar 3 the second
// ending (played 1, 2, 1, 3).

test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

const SCORE = '/test_scores/lyrics_repeat_volta.musicxml';
const page = (p: Page) => p.getByTestId('performer-page-svg');

async function open(p: Page) {
  await p.goto(`/perform?score=${encodeURIComponent(SCORE)}`);
  await expect(page(p).locator('svg .Note').first()).toBeAttached({ timeout: 60_000 });
}

/** The end-repeat's dots (an end-repeat draws two dots, a thin and a thick line, all as BarLine). */
async function endRepeatDot(p: Page) {
  const boxes = await page(p)
    .locator('svg .BarLine')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          width: box.width,
          height: box.height,
        };
      }),
    );
  // The dots are the only barline shapes with a small height and a width
  const dot = boxes.find((box) => box.height > 0 && box.height < 8 && box.width > 0);
  if (!dot) throw new Error('no end-repeat on the page');
  return dot;
}

async function openControls(p: Page) {
  const box = (await p.getByTestId('performer-surface').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await p.mouse.move(box.x + box.width / 2, box.y + 10);
  await p.mouse.down();
  await p.waitForTimeout(800);
  await p.mouse.up();
  await expect(p.getByTestId('performer-bar')).toBeVisible();
}

test('tapping the end-repeat shows where the music goes back to; Play-through writes the repeats out', async ({
  page: p,
}) => {
  await open(p);
  const dot = await endRepeatDot(p);
  await p.mouse.click(dot.x, dot.y);
  const target = p.getByTestId('performer-jump-target');
  await expect(target).toBeVisible();
  // Bar 1: left of the end-repeat
  const targetBox = (await target.boundingBox())!;
  expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(dot.x);
  await expect(page(p)).toHaveAttribute('data-page', '0');

  const writtenNotes = await page(p).locator('svg .Note').count();
  await p.waitForTimeout(1600); // the highlight gone
  await openControls(p);
  await p.getByTestId('performer-play-through').check();
  await p.getByTestId('performer-done').click();
  // Bars 1 and 2 played twice: more notes than written
  await expect
    .poll(() => page(p).locator('svg .Note').count(), { timeout: 60_000 })
    .toBeGreaterThan(writtenNotes);

  // Written out there is no end-repeat: a tap where it was jumps nowhere
  await p.mouse.click(dot.x, dot.y);
  await p.waitForTimeout(300);
  await expect(target).toHaveCount(0);
});
