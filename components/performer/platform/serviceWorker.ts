import { isEmbedBuild } from './performPath';

export type OfflineAppState = 'unsupported' | 'development' | 'installing' | 'ready' | 'failed';

/**
 * Registers performer mode's service worker (public/perform-sw.js), scoped to the perform page, so the app opens with
 * no network. Production builds only: the dev server's build files are not content-hashed. Once it is active, sends
 * it the build files this page loaded before it took control, so the next launch works offline.
 */
export async function registerPerformWorker(
  production = process.env.NODE_ENV === 'production',
): Promise<OfflineAppState> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (!production) return 'development';
  const base = isEmbedBuild() ? '/score-editor' : '';
  try {
    await navigator.serviceWorker.register(`${base}/perform-sw.js`, { scope: `${base}/perform` });
    const ready = await navigator.serviceWorker.ready;
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => new URL(name).pathname.startsWith(`${base}/_next/static/`));
    ready.active?.postMessage({ type: 'cache-urls', urls });
    return 'ready';
  } catch {
    return 'failed';
  }
}
