import { readBarSignatures, writtenSignatures } from '../annotations/barSignatures';

export interface SignatureCache {
  readonly key: string;
  readonly signatures: string[];
}

/**
 * The written score's bar signatures for one loaded score and part (`key`), read from the engine once: the cache when
 * it is for this key. In Play-through the shown score is the unrolled one: its bars are mapped back to written bars.
 */
export async function cachedBarSignatures(
  cache: SignatureCache,
  key: string,
  read: (partIndex: number) => Promise<string[]>,
  playedBars: readonly number[] | null,
): Promise<SignatureCache> {
  if (cache.key === key) return cache;
  const view = await readBarSignatures(read);
  return { key, signatures: playedBars ? writtenSignatures(view, playedBars) : view };
}
