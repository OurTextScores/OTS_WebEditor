import { fetchDefaultSoundFont } from './soundfont';

export type SoundFontSource = {
  url: string;
  bytes: Uint8Array;
};

export type SoundFontTarget = object & {
  setSoundFont: (bytes: Uint8Array) => Promise<void> | void;
};

type EnsureOptions<TTarget extends SoundFontTarget> = {
  forceRetry?: boolean;
  signal?: AbortSignal;
  install?: (target: TTarget, bytes: Uint8Array) => Promise<void> | void;
};

/**
 * Owns soundfont fetch, pristine-byte caching, per-score installation, and retry.
 * Each installation receives a copy because the worker bridge transfers and
 * detaches its ArrayBuffer.
 */
export class SoundFontManager<TTarget extends SoundFontTarget> {
  private source: SoundFontSource | null = null;
  private pendingSource: Promise<SoundFontSource | null> | null = null;
  private version = 0;
  private applied = new WeakMap<TTarget, number>();
  private failed = new WeakMap<TTarget, number>();
  private pendingInstall = new WeakMap<TTarget, { version: number; promise: Promise<boolean> }>();

  constructor(
    private readonly loadSource: (
      signal?: AbortSignal,
    ) => Promise<SoundFontSource | null> = fetchDefaultSoundFont,
  ) {}

  async prefetch(signal?: AbortSignal): Promise<SoundFontSource | null> {
    if (this.source) return this.source;
    if (this.pendingSource) return this.pendingSource;

    const requestedVersion = this.version;
    const pending = this.loadSource(signal)
      .then((source) => {
        if (source && requestedVersion === this.version) {
          this.source = { url: source.url, bytes: source.bytes.slice() };
        }
        return requestedVersion === this.version ? this.source : null;
      })
      .finally(() => {
        if (this.pendingSource === pending) this.pendingSource = null;
      });
    this.pendingSource = pending;
    return pending;
  }

  async ensure(target: TTarget, options?: EnsureOptions<TTarget>): Promise<boolean> {
    const requestedVersion = this.version;
    if (this.applied.get(target) === requestedVersion) return true;
    if (this.failed.get(target) === requestedVersion && !options?.forceRetry) return false;

    const existing = this.pendingInstall.get(target);
    if (existing?.version === requestedVersion) return existing.promise;

    const pending = (async () => {
      try {
        // A source replacement cannot cancel a worker transfer already in
        // progress. Serialize the new install behind it so stale bytes can
        // never land after the replacement.
        if (existing) await existing.promise;
        if (requestedVersion !== this.version) return false;
        const source = await this.prefetch(options?.signal);
        if (!source || requestedVersion !== this.version) {
          if (requestedVersion === this.version) this.failed.set(target, requestedVersion);
          return false;
        }
        const install =
          options?.install ?? ((score: TTarget, bytes: Uint8Array) => score.setSoundFont(bytes));
        await install(target, source.bytes.slice());
        if (requestedVersion !== this.version) return false;
        this.applied.set(target, requestedVersion);
        this.failed.delete(target);
        return true;
      } catch (error) {
        if (options?.signal?.aborted) throw error;
        if (requestedVersion === this.version) this.failed.set(target, requestedVersion);
        return false;
      }
    })();
    const record = { version: requestedVersion, promise: pending };
    this.pendingInstall.set(target, record);
    try {
      return await pending;
    } finally {
      if (this.pendingInstall.get(target) === record) this.pendingInstall.delete(target);
    }
  }

  /** Replace defaults with uploaded/pristine bytes and invalidate every target. */
  replace(source: SoundFontSource) {
    this.version += 1;
    this.source = { url: source.url, bytes: source.bytes.slice() };
    this.pendingSource = null;
  }

  /** Explicitly evict source bytes as well as invalidating target installs. */
  evictSource() {
    this.version += 1;
    this.source = null;
    this.pendingSource = null;
  }

  /** Reinstall on future targets without evicting already-fetched source bytes. */
  invalidateTargets() {
    this.version += 1;
    // A fetch started under the prior version cannot populate this version.
    // Let a subsequent request start fresh without evicting a completed cache.
    this.pendingSource = null;
  }

  isApplied(target: TTarget): boolean {
    return this.applied.get(target) === this.version;
  }
}
