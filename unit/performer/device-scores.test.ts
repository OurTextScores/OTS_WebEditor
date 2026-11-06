import { describe, expect, it, vi } from 'vitest';
import { performHref } from '../../components/performer/platform/performPath';
import {
  memoryScoreStore,
  isLocalScore,
  newLocalKey,
} from '../../components/performer/platform/scoreStore';
import { keepScoreFile, pieceNameOf } from '../../components/performer/platform/scoreFiles';
import { scoreBytes } from '../../components/performer/session/loadPerformerScore';
import { makeAvailableOffline, offlineStates } from '../../components/performer/setlists/offline';
import { addItem, newSetlist } from '../../components/performer/setlists/setlistModel';

const bytes = new Uint8Array([1, 2, 3]);

describe('perform page address', () => {
  it('is /perform on the server build and perform.html under the embed base path', () => {
    expect(performHref({}, false)).toBe('/perform');
    expect(performHref({ score: 'local:a b', selftest: true }, false)).toBe(
      '/perform?score=local%3Aa%20b&selftest',
    );
    expect(performHref({ setlist: 'x', item: 2 }, true)).toBe(
      '/score-editor/perform.html?setlist=x&item=2',
    );
  });
});

describe('scores on the device', () => {
  it('reads a kept copy before fetching, and refuses a local score that is gone', async () => {
    const store = memoryScoreStore([
      { key: '/a.mscz', name: 'A', format: 'mscz', bytes, savedAt: 1 },
    ]);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect((await scoreBytes('/a.mscz', new AbortController().signal, store)).bytes).toBe(bytes);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(scoreBytes('local:gone', new AbortController().signal, store)).rejects.toThrow(
      'no longer on this device',
    );
    fetcher.mockRestore();
    const key = newLocalKey();
    expect(isLocalScore(key)).toBe(true);
    expect(isLocalScore('/a.mscz')).toBe(false);
  });

  it('makes a setlist available offline piece by piece, carrying on past a failure', async () => {
    const store = memoryScoreStore();
    let list = newSetlist('Gig');
    list = addItem(list, { score: '/one.mscz', name: 'One' });
    list = addItem(list, { score: '/missing.mscz', name: 'Missing' });
    list = addItem(list, { score: 'local:gone', name: 'Gone' });
    expect(await offlineStates(list, store)).toEqual(['online-only', 'online-only', 'online-only']);
    const fetcher = (async (url: string) =>
      url.endsWith('/one.mscz')
        ? new Response(bytes)
        : new Response('', { status: 404 })) as unknown as typeof fetch;
    const reports: string[] = [];
    await makeAvailableOffline(
      list,
      store,
      (index, state) => reports.push(`${index}:${state}`),
      fetcher,
    );
    expect(reports).toEqual(['0:fetching', '0:on-device', '1:fetching', '1:failed', '2:failed']);
    expect((await store.get('/one.mscz'))?.name).toBe('One');
    expect(await offlineStates(list, store)).toEqual(['on-device', 'online-only', 'online-only']);
  });
});

describe('score files from the device', () => {
  it('keeps a picked file as a local score named after the file', async () => {
    const store = memoryScoreStore();
    const xml = '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>';
    const file = new File([xml], 'Bach Prelude.musicxml');
    const kept = await keepScoreFile(file, store);
    expect(isLocalScore(kept.key)).toBe(true);
    expect(kept.name).toBe('Bach Prelude');
    const stored = await store.get(kept.key);
    expect(stored?.format).toBe('musicxml');
    expect(new TextDecoder().decode(stored?.bytes)).toBe(xml);
    expect(pieceNameOf('.mscz')).toBe('Untitled score');
  });
});
