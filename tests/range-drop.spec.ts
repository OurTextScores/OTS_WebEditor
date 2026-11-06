import { expect, test, type Page } from './helpers/diagnostic-test';

// Range drop (roadmap E11), as desktop MuseScore: with a range selected, Alt+click or Alt+drag pastes a copy of it
// where the pointer is released, outlined where it would land; Escape cancels.

const bars = (page: Page) =>
  page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore?: { saveXml?: () => Promise<unknown> } })
      .__webmscore;
    const saved = await score?.saveXml?.();
    const xml = typeof saved === 'string' ? saved : new TextDecoder().decode(saved as Uint8Array);
    return [...xml.matchAll(/<measure\b[\s\S]*?<\/measure>/g)].map((m) =>
      [...m[0].matchAll(/<step>(\w)<\/step>\s*<octave>(\d)<\/octave>/g)]
        .map((n) => n[1] + n[2])
        .join(' '),
    );
  });

async function centre(page: Page, index: number) {
  const box = await page
    .locator('[data-testid="svg-container"] svg .Note')
    .nth(index)
    .boundingBox();
  if (!box) throw new Error(`no box for note ${index}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('Alt+click pastes the selected range at the bar clicked, and Escape cancels an Alt+drag', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml'); // F4, A4, C5, E5
  const notes = page.locator('[data-testid="svg-container"] svg .Note');
  await notes.first().waitFor({ timeout: 60_000 });
  expect(await bars(page)).toEqual(['F4', 'A4', 'C5', 'E5']);

  // A range from bar 1's note (Ctrl+Shift+Right from a note reaches through bar 2)
  await notes.first().click();
  await page.getByTestId('selection-overlay').waitFor({ timeout: 30_000 });
  await page.keyboard.press('ControlOrMeta+Shift+ArrowRight');
  // The editor learns the selection kind from the engine asynchronously: wait until it knows it is a range
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __otsCommands?: { list(): { id: string; enabled: boolean }[] };
            }
          ).__otsCommands
            ?.list()
            .find((command) => command.id === 'edit.select.similarRange')?.enabled,
      ),
    )
    .toBe(true);

  // Escape during an Alt+drag: no preview left, nothing pasted
  const bar3 = await centre(page, 2);
  const bar4 = await centre(page, 3);
  await page.keyboard.down('Alt');
  await page.mouse.move(bar3.x, bar3.y);
  await page.mouse.down();
  await expect(page.getByTestId('range-drop-preview').first()).toBeVisible();
  await page.mouse.move(bar4.x, bar4.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('range-drop-preview')).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await bars(page)).toEqual(['F4', 'A4', 'C5', 'E5']);

  // Alt+click on bar 3: bars 1-2 copied over bars 3-4, keeping their place in the bar
  await page.keyboard.down('Alt');
  await page.mouse.move(bar3.x, bar3.y);
  await page.mouse.down();
  await expect(page.getByTestId('range-drop-preview').first()).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('range-drop-preview')).toHaveCount(0);
  await expect.poll(() => bars(page)).toEqual(['F4', 'A4', 'F4', 'A4']);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => bars(page)).toEqual(['F4', 'A4', 'C5', 'E5']);
});
