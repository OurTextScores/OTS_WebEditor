import type { AiModelDescriptor, AiModelProvider } from './types';

const DISCOVERY_TTL_MS = 15 * 60 * 1000;

type CacheEntry = {
  descriptor: AiModelDescriptor;
  expiresAt: number;
};
const globalCache = globalThis as typeof globalThis & {
  __otsAiModelCapabilityCache?: Map<string, CacheEntry>;
};

const cache = globalCache.__otsAiModelCapabilityCache ?? new Map<string, CacheEntry>();
globalCache.__otsAiModelCapabilityCache = cache;

const keyFor = (provider: AiModelProvider, modelId: string) =>
  `${provider}:${modelId.trim().replace(/^models\//, '')}`;

export const rememberDiscoveredAiModelDescriptors = (descriptors: AiModelDescriptor[]): void => {
  const expiresAt = Date.now() + DISCOVERY_TTL_MS;
  for (const descriptor of descriptors) {
    cache.set(keyFor(descriptor.provider, descriptor.id), { descriptor, expiresAt });
  }
};

export const getDiscoveredAiModelDescriptor = (
  provider: AiModelProvider,
  modelId: string,
): AiModelDescriptor | null => {
  const key = keyFor(provider, modelId);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.descriptor;
};
