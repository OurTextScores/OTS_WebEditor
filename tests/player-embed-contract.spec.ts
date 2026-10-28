import { expect, test } from '@playwright/test';

test('two player frames isolate commands, reject other sources, resize and dispose independently', async ({
  page,
}) => {
  await page.route('**/phase5-player-host.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Player contract host</title>
        <iframe id="first" title="First player" style="width:45%;height:500px"></iframe>
        <iframe id="second" title="Second player" style="width:45%;height:500px"></iframe>
        <script>
          window.playerEvents = [];
          window.addEventListener('message', event => {
            if (event.origin !== location.origin) return;
            const frame = ['first', 'second'].find(id => document.getElementById(id)?.contentWindow === event.source);
            if (frame) window.playerEvents.push({ frame, data: event.data });
          });
          for (const id of ['first', 'second']) {
            const query = new URLSearchParams({ score: '/test_scores/two_chords.musicxml', embed: 'player', playerId: id, parentOrigin: location.origin });
            document.getElementById(id).src = '/?' + query;
          }
        </script>`,
    }),
  );
  await page.goto('/phase5-player-host.html');
  const first = page.getByTitle('First player').contentFrame();
  const second = page.getByTitle('Second player').contentFrame();
  await expect(first.getByTestId('player-seek')).toBeEnabled({ timeout: 90_000 });
  await expect(second.getByTestId('player-seek')).toBeEnabled({ timeout: 90_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const events = (
            window as typeof window & {
              playerEvents: {
                frame: string;
                data: { event?: string; playerId?: string; version?: number };
              }[];
            }
          ).playerEvents;
          return ['first', 'second'].every((id) =>
            events.some(
              (e) =>
                e.frame === id &&
                e.data.event === 'ready' &&
                e.data.playerId === id &&
                e.data.version === 1,
            ),
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  // A sibling's actual Window is not the parent, even though it has the correct origin and target ID.
  await first.locator('body').evaluate(() => {
    window.parent.frames[1].postMessage(
      { type: 'ots-player:command', version: 1, playerId: 'second', command: 'seek', value: 500 },
      window.location.origin,
    );
  });
  await page.evaluate(() => {
    const firstWindow = (document.getElementById('first') as HTMLIFrameElement).contentWindow!;
    for (const command of [
      { type: 'ots-player:command', version: 1, playerId: 'second', command: 'seek', value: 500 },
      { type: 'ots-player:command', version: 2, playerId: 'first', command: 'seek', value: 500 },
      { type: 'ots-player:command', version: 1, playerId: 'first', command: 'seek', value: -1 },
      { type: 'ots-player:command', version: 1, playerId: 'first', command: 'seek', value: '500' },
      null,
    ])
      firstWindow.postMessage(command, location.origin);
    // A valid command on each connection is a processing sentinel for the preceding messages.
    for (const id of ['first', 'second']) {
      const target = (document.getElementById(id) as HTMLIFrameElement).contentWindow!;
      target.postMessage(
        {
          type: 'ots-player:command',
          version: 1,
          playerId: id,
          command: 'set-follow',
          value: false,
        },
        location.origin,
      );
    }
  });
  await expect(first.locator('button[aria-label="Follow score"]').first()).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(second.locator('button[aria-label="Follow score"]').first()).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(first.getByTestId('player-seek')).toHaveValue('0');
  await expect(second.getByTestId('player-seek')).toHaveValue('0');

  await page.evaluate(() => {
    const target = (document.getElementById('first') as HTMLIFrameElement).contentWindow!;
    target.postMessage(
      { type: 'ots-player:command', version: 1, playerId: 'first', command: 'seek', value: 500 },
      location.origin,
    );
  });
  await expect(first.getByTestId('player-seek')).toHaveValue('500');
  await expect(second.getByTestId('player-seek')).toHaveValue('0');
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(second.getByTestId('player-svg').locator('svg')).toBeVisible();
  await page.locator('#first').evaluate((el) => el.remove());
  await page.evaluate(() => {
    const target = (document.getElementById('second') as HTMLIFrameElement).contentWindow!;
    target.postMessage(
      { type: 'ots-player:command', version: 1, playerId: 'second', command: 'seek', value: 500 },
      location.origin,
    );
  });
  await expect(second.getByTestId('player-seek')).toHaveValue('500');
});
