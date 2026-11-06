import { resolvePublicScoreUrl, detectScoreInputFormat } from '../../../lib/public-score-url';
import { isLocalScore, type ScoreStore } from '../platform/scoreStore';
import type { Setlist } from './setlistModel';

export type OfflineState = 'on-device' | 'fetching' | 'failed' | 'online-only';

/** Each piece's place: kept on the device (local scores always are), or only online. */
export async function offlineStates(setlist: Setlist, store: ScoreStore): Promise<OfflineState[]> {
  return Promise.all(
    setlist.items.map(async (item) =>
      (await store.get(item.score).catch(() => undefined)) ? 'on-device' : 'online-only',
    ),
  );
}

/**
 * Makes a setlist available offline: fetches each piece not yet on the device and keeps its bytes (keyed by its URL,
 * so opening it later reads the copy). Reports each piece's state as it goes; a failure leaves the others going.
 */
export async function makeAvailableOffline(
  setlist: Setlist,
  store: ScoreStore,
  report: (index: number, state: OfflineState) => void,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  for (const [index, item] of setlist.items.entries()) {
    if (await store.get(item.score).catch(() => undefined)) {
      report(index, 'on-device');
      continue;
    }
    if (isLocalScore(item.score)) {
      report(index, 'failed'); // handed over from the editor, and since removed
      continue;
    }
    report(index, 'fetching');
    try {
      const response = await fetcher(resolvePublicScoreUrl(item.score));
      if (!response.ok) throw new Error(String(response.status));
      const bytes = new Uint8Array(await response.arrayBuffer());
      await store.put({
        key: item.score,
        name: item.name,
        format: detectScoreInputFormat(item.score, bytes),
        bytes,
        savedAt: Date.now(),
      });
      report(index, 'on-device');
    } catch {
      report(index, 'failed');
    }
  }
}

/** Storage used and available on the device, in MB (null when the browser does not say). */
export async function storageEstimate(): Promise<{ usedMb: number; quotaMb: number } | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  if (!estimate?.quota) return null;
  return {
    usedMb: Math.round((estimate.usage ?? 0) / 1e6),
    quotaMb: Math.round(estimate.quota / 1e6),
  };
}
