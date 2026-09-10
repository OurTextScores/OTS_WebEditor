import registryData from './registry.json';
import type {
  AiModelCapabilityPatch,
  AiModelDescriptor,
  AiModelProvider,
  AiModelRegistryRule,
  CapabilitySupport,
  ProviderModelMetadata,
} from './types';

type RegistryData = {
  version: string;
  rules: AiModelRegistryRule[];
};

const registry = registryData as RegistryData;

export const AI_MODEL_CAPABILITY_REGISTRY_VERSION = registry.version;
export const AI_MODEL_CAPABILITY_RULES = registry.rules;

const UNKNOWN: CapabilitySupport = 'unknown';

const createUnknownDescriptor = (provider: AiModelProvider, id: string): AiModelDescriptor => ({
  id,
  provider,
  inputs: {
    text: 'supported',
    image: UNKNOWN,
    pdf: UNKNOWN,
    video: UNKNOWN,
  },
  parameters: {
    maxOutputTokens: { support: UNKNOWN },
    temperature: { support: UNKNOWN },
    reasoning: { support: UNKNOWN },
  },
  source: 'unknown',
  registryVersion: AI_MODEL_CAPABILITY_REGISTRY_VERSION,
  matchedRules: [],
});

const mergePatch = (
  descriptor: AiModelDescriptor,
  patch: AiModelCapabilityPatch,
): AiModelDescriptor => ({
  ...descriptor,
  ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
  ...(patch.contextWindow !== undefined ? { contextWindow: patch.contextWindow } : {}),
  ...(patch.maxOutputTokens !== undefined ? { maxOutputTokens: patch.maxOutputTokens } : {}),
  inputs: {
    ...descriptor.inputs,
    ...patch.inputs,
  },
  parameters: {
    maxOutputTokens: {
      ...descriptor.parameters.maxOutputTokens,
      ...patch.parameters?.maxOutputTokens,
    },
    temperature: {
      ...descriptor.parameters.temperature,
      ...patch.parameters?.temperature,
    },
    reasoning: {
      ...descriptor.parameters.reasoning,
      ...patch.parameters?.reasoning,
    },
  },
});

export const resolveAiModelDescriptor = (
  provider: AiModelProvider,
  modelId: string,
  providerMetadata?: ProviderModelMetadata | null,
): AiModelDescriptor => {
  const normalizedId = modelId.trim().replace(/^models\//, '');
  let descriptor = createUnknownDescriptor(provider, normalizedId);
  const matchedRules: string[] = [];

  for (const rule of AI_MODEL_CAPABILITY_RULES) {
    if (rule.provider !== provider) {
      continue;
    }
    let matches = false;
    try {
      matches = new RegExp(rule.modelPattern).test(normalizedId);
    } catch {
      continue;
    }
    if (matches) {
      descriptor = mergePatch(descriptor, rule.capabilities);
      matchedRules.push(rule.id);
    }
  }

  const hasProviderMetadata = Boolean(providerMetadata);
  if (providerMetadata) {
    descriptor = mergePatch(descriptor, providerMetadata);
  }

  return {
    ...descriptor,
    id: normalizedId,
    source:
      hasProviderMetadata && matchedRules.length > 0
        ? 'merged'
        : hasProviderMetadata
          ? 'provider'
          : matchedRules.length > 0
            ? 'registry'
            : 'unknown',
    matchedRules,
  };
};

export const resolveAiModelDescriptors = (
  provider: AiModelProvider,
  models: Array<string | ProviderModelMetadata>,
): AiModelDescriptor[] => {
  const byId = new Map<string, AiModelDescriptor>();
  for (const model of models) {
    const metadata = typeof model === 'string' ? null : model;
    const id = typeof model === 'string' ? model : model.id;
    if (!id.trim()) {
      continue;
    }
    const descriptor = resolveAiModelDescriptor(provider, id, metadata);
    byId.set(descriptor.id, descriptor);
  }
  return [...byId.values()];
};

export const parseAiModelDescriptors = (value: unknown): AiModelDescriptor[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is AiModelDescriptor => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const record = item as Partial<AiModelDescriptor>;
    return (
      typeof record.id === 'string' &&
      typeof record.provider === 'string' &&
      Boolean(record.inputs && typeof record.inputs === 'object') &&
      Boolean(record.parameters?.maxOutputTokens) &&
      Boolean(record.parameters?.temperature) &&
      Boolean(record.parameters?.reasoning)
    );
  });
};

export type AiModelRequestCapabilities = {
  maxTokens?: number | null;
  temperature?: number | null;
  hasImage?: boolean;
  hasPdf?: boolean;
};

export type AiModelRequestValidation = {
  ok: boolean;
  descriptor: AiModelDescriptor;
  error?: string;
};

export const validateAiModelRequest = (
  provider: AiModelProvider,
  modelId: string,
  request: AiModelRequestCapabilities,
  descriptorOverride?: AiModelDescriptor | null,
): AiModelRequestValidation => {
  const descriptor = descriptorOverride ?? resolveAiModelDescriptor(provider, modelId);
  const maxTokens = request.maxTokens;
  if (maxTokens != null) {
    const capability = descriptor.parameters.maxOutputTokens;
    if (capability.support !== 'supported') {
      return {
        ok: false,
        descriptor,
        error: `Custom max output is not confirmed for model ${descriptor.id}. Use Auto.`,
      };
    }
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
      return { ok: false, descriptor, error: 'Max output must be a positive number.' };
    }
    const maximum = descriptor.maxOutputTokens ?? capability.max;
    if (maximum !== undefined && maxTokens > maximum) {
      return {
        ok: false,
        descriptor,
        error: `Max output for ${descriptor.id} cannot exceed ${maximum}.`,
      };
    }
    if (capability.min !== undefined && maxTokens < capability.min) {
      return {
        ok: false,
        descriptor,
        error: `Max output for ${descriptor.id} must be at least ${capability.min}.`,
      };
    }
  }

  const temperature = request.temperature;
  if (temperature != null) {
    const capability = descriptor.parameters.temperature;
    if (capability.support !== 'supported') {
      return {
        ok: false,
        descriptor,
        error:
          capability.support === 'unknown'
            ? `Temperature is not confirmed for model ${descriptor.id}. Use Auto.`
            : `Temperature is not supported for model ${descriptor.id}.`,
      };
    }
    if (!Number.isFinite(temperature)) {
      return { ok: false, descriptor, error: 'Temperature must be a finite number.' };
    }
    if (capability.fixed !== undefined && temperature !== capability.fixed) {
      return {
        ok: false,
        descriptor,
        error: `Temperature for ${descriptor.id} is fixed at ${capability.fixed}.`,
      };
    }
    if (capability.min !== undefined && temperature < capability.min) {
      return {
        ok: false,
        descriptor,
        error: `Temperature for ${descriptor.id} must be at least ${capability.min}.`,
      };
    }
    if (capability.max !== undefined && temperature > capability.max) {
      return {
        ok: false,
        descriptor,
        error: `Temperature for ${descriptor.id} cannot exceed ${capability.max}.`,
      };
    }
  }

  if (request.hasImage && descriptor.inputs.image !== 'supported') {
    return {
      ok: false,
      descriptor,
      error: `Image input is not confirmed for model ${descriptor.id}. Disable image context or choose a confirmed model.`,
    };
  }
  if (request.hasPdf && descriptor.inputs.pdf !== 'supported') {
    return {
      ok: false,
      descriptor,
      error: `PDF input is not confirmed for model ${descriptor.id}. Disable PDF context or choose a confirmed model.`,
    };
  }

  return { ok: true, descriptor };
};
