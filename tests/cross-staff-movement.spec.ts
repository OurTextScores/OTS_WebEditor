import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

test('worker moves a cross-staff note with undo and MusicXML export', async ({ page }) => {
  test.setTimeout(120_000);
  // Serve the actual generated worker bundle and engine without starting an editor UI.
  const assets = new Map([
    ['/', { body: Buffer.from('<!doctype html><script type="module">import W from "/webmscore.webpack.mjs"; window.__staffMoveWorker = W;</script>'), type: 'text/html' }],
    ['/webmscore.webpack.mjs', { body: await readFile('webmscore-fork/web-public/webmscore.webpack.mjs'), type: 'text/javascript' }],
    ['/webmscore.lib.wasm', { body: await readFile('public/webmscore.lib.wasm'), type: 'application/wasm' }],
    ['/webmscore.lib.data', { body: await readFile('public/webmscore.lib.data'), type: 'application/octet-stream' }],
    ['/fixture.musicxml', { body: await readFile('tools/musescore/fixtures/osmd-fidelity/cross-staff.musicxml'), type: 'application/xml' }],
  ]);
  const server = createServer((request, response) => {
    const asset = assets.get(new URL(request.url || '/', 'http://localhost').pathname);
    if (!asset) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': asset.type }); response.end(asset.body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Worker test server has no TCP port');
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForFunction(() => !!(window as typeof window & { __staffMoveWorker?: unknown }).__staffMoveWorker);
    const result = await page.evaluate(async () => {
      const W = (window as typeof window & { __staffMoveWorker: { load: (format: string, data: Uint8Array) => Promise<Score> } }).__staffMoveWorker;
      const score = await W.load('musicxml', new Uint8Array(await (await fetch('/fixture.musicxml')).arrayBuffer()));
      try {
        if (!score.moveSelectedChordRestToStaff || !score.selectPartMeasureByIndex || !score.selectNextChord ||
            !score.selectPrevChord || !score.getUndoInfo || !score.saveXml || !score.undo || !score.redo) {
          throw new Error('Staff movement or verification capability unavailable');
        }
        const facts = (value: string | Uint8Array) => {
          const xmlText = typeof value === 'string' ? value : new TextDecoder().decode(value);
          const document = new DOMParser().parseFromString(xmlText, 'application/xml');
          return [...document.querySelectorAll('note')].filter(note => note.querySelector('pitch')).map(note => ({
            step: note.querySelector('pitch > step')?.textContent,
            staff: note.querySelector('staff')?.textContent || '1',
            voice: note.querySelector('voice')?.textContent,
          }));
        };
        const empty = await score.moveSelectedChordRestToStaff('up');
        const selected = [await score.selectPartMeasureByIndex(0, 0), await score.selectNextChord(), await score.selectPrevChord()];
        const before = facts(await score.saveXml());
        const index = (await score.getUndoInfo()).index;
        const boundary = await score.moveSelectedChordRestToStaff('down');
        const moved = await score.moveSelectedChordRestToStaff('up');
        const after = facts(await score.saveXml());
        const afterIndex = (await score.getUndoInfo()).index;
        const undone = await score.undo();
        const afterUndo = facts(await score.saveXml());
        const redone = await score.redo();
        const afterRedo = facts(await score.saveXml());
        return { empty, selected, before, index, boundary, moved, after, afterIndex, undone, afterUndo, redone, afterRedo };
      } finally { await score.destroy(); }
    });
    expect(result.empty).toBe(false);
    expect(result.selected).toEqual([true, true, true]);
    expect(result.before[3]).toMatchObject({ step: 'F', staff: '2' });
    expect(result.boundary).toBe(false);
    expect(result.moved).toBe(true);
    expect(result.after[3]).toEqual({ ...result.before[3], staff: '1' });
    expect(result.afterIndex).toBe(result.index + 1);
    expect(result.undone).toBe(true);
    expect(result.afterUndo).toEqual(result.before);
    expect(result.redone).toBe(true);
    expect(result.afterRedo).toEqual(result.after);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
