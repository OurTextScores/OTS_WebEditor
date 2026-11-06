import { loadScoreFromUrl } from '../../../lib/score-loader';
import { isStandalone } from '../platform/displayMode';

/*
 * The automatic checks of the device self-test (performer mode, Phase 0/6): what an iPad really does with the things
 * the plan could not verify without one. Each check returns plain data for the report; none throws.
 */

export type CheckResult = Record<string, unknown>;

export function environment(): CheckResult {
  return {
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    language: navigator.language,
  };
}

export async function wakeLock(): Promise<CheckResult> {
  const api = (
    navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    }
  ).wakeLock;
  if (!api) return { supported: false };
  try {
    const sentinel = await api.request('screen');
    await sentinel.release();
    return { supported: true, acquired: true };
  } catch (error) {
    return { supported: true, acquired: false, error: String(error) };
  }
}

export function fullscreen(): CheckResult {
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  const element = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return {
    fullscreenEnabled: doc.fullscreenEnabled ?? null,
    webkitFullscreenEnabled: doc.webkitFullscreenEnabled ?? null,
    requestFullscreen: typeof element.requestFullscreen === 'function',
    webkitRequestFullscreen: typeof element.webkitRequestFullscreen === 'function',
  };
}

export async function storage(): Promise<CheckResult> {
  const manager = navigator.storage;
  if (!manager) return { supported: false };
  const estimate = await manager.estimate?.().catch(() => null);
  const persistedBefore = await manager.persisted?.().catch(() => null);
  const persist = await manager.persist?.().catch(() => null);
  return {
    supported: true,
    quotaMb: estimate?.quota ? Math.round(estimate.quota / 1048576) : null,
    usageMb: estimate?.usage ? Math.round(estimate.usage / 1048576) : null,
    persistedBefore,
    persistGranted: persist,
  };
}

/** Opens a score on the engine and renders every page: the time it takes, or where it failed. */
export async function engineRun(scoreUrl: string): Promise<CheckResult> {
  const started = performance.now();
  try {
    const { loadedScore } = await loadScoreFromUrl(scoreUrl, { progressiveEnabled: false });
    const loadedMs = Math.round(performance.now() - started);
    const pages = (await loadedScore.npages?.()) ?? 1;
    const renderStarted = performance.now();
    for (let page = 0; page < pages; page += 1) await loadedScore.saveSvg(page, true, false);
    const result = {
      score: scoreUrl,
      ok: true,
      loadMs: loadedMs,
      pages,
      renderAllMs: Math.round(performance.now() - renderStarted),
    };
    loadedScore.destroy();
    return result;
  } catch (error) {
    return {
      score: scoreUrl,
      ok: false,
      error: String(error),
      afterMs: Math.round(performance.now() - started),
    };
  }
}

/** Whether the app is kept for offline use: the service worker controlling this page, and what it has cached. */
export async function offlineApp(): Promise<CheckResult> {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const cacheNames = await globalThis.caches?.keys().catch(() => [] as string[]);
  const cached: Record<string, number> = {};
  for (const name of cacheNames ?? []) {
    if (name.startsWith('ots-perform-'))
      cached[name] = (await (await caches.open(name)).keys()).length;
  }
  return {
    supported: true,
    registered: Boolean(registration),
    scope: registration?.scope ?? null,
    controlled: Boolean(navigator.serviceWorker.controller),
    cachedFiles: cached,
  };
}
