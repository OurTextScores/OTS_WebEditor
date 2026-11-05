import { expect, test, type Page } from './helpers/diagnostic-test';
import type { BrowserScoreWindow } from './browser-score-types';
import { runCommand } from './helpers/commands';

/**
 * Lyric entry as MuseScore does it (roadmap E17): Add ▸ Text ▸ Lyrics opens a box on the selected note; typing writes
 * the syllable, "-" moves on with a hyphen, Space as a new word, "_" under an extender, Escape stops.
 */

const lyrics = async (page: Page) =>
  [...(await page.evaluate(async () => (window as BrowserScoreWindow).__webmscore!.saveXml!())).matchAll(/<lyric number="(\d+)"[^>]*>([\s\S]*?)<\/lyric>/g)]
    .map((m) => `${m[1]}:${m[2].match(/<syllabic>(\w+)<\/syllabic>/)?.[1] ?? '-'}:${m[2].match(/<text>([^<]*)<\/text>/)?.[1] ?? ''}`)
    .filter((l) => !l.endsWith(':-:'));

test('typing lyrics with MuseScore’s keys: hyphen, Space, and Escape', async ({ page }) => {
  await page.goto('/?score=/test_scores/eight_bars_one_voice.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('no note');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await runCommand(page, 'add.text.lyrics');

  const box = page.getByTestId('lyrics-entry');
  await expect(box).toBeFocused();
  const firstX = (await box.boundingBox())!.x;
  await page.keyboard.type('Hel');
  await page.keyboard.press('-');
  // The box moved to the next note, empty.
  await expect.poll(async () => (await box.boundingBox())?.x ?? 0).toBeGreaterThan(firstX);
  await expect(box).toHaveValue('');
  await page.keyboard.type('lo');
  await page.keyboard.press(' ');
  await page.keyboard.type('world');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);

  await expect.poll(() => lyrics(page)).toEqual(['1:begin:Hel', '1:end:lo', '1:single:world']);
  await expect(page.locator('svg .Lyrics')).toHaveCount(3);

  // One undo step per syllable: undo takes back "world".
  await runCommand(page, 'edit.undo');
  await expect.poll(() => lyrics(page)).toEqual(['1:begin:Hel', '1:end:lo']);
});

test('Ctrl+Space types a space in the syllable, and Enter starts the next verse', async ({ page }) => {
  await page.goto('/?score=/test_scores/eight_bars_one_voice.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const note = await page.locator('svg .Note').first().boundingBox();
  if (!note) throw new Error('no note');
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await runCommand(page, 'add.text.lyrics');
  const box = page.getByTestId('lyrics-entry');
  await expect(box).toBeFocused();
  await page.keyboard.type('a');
  await page.keyboard.press('Control+Space');
  await page.keyboard.type('b');
  await page.keyboard.press('Enter');
  await expect(box).toHaveAccessibleName('Lyrics, verse 2');
  await page.keyboard.type('two');
  await page.keyboard.press('Escape');
  await expect.poll(() => lyrics(page)).toEqual(['1:single:a b', '2:single:two']);
});
