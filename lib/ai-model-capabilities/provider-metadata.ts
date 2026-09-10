import { resolveAiModelDescriptors } from './resolve';
import type {
  AiModelDescriptor,
  AiModelProvider,
  CapabilitySupport,
  ProviderModelMetadata,
} from './types';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readPositiveNumber = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const readFiniteNumber = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const supportFromBoolean = (value: unknown): CapabilitySupport | undefined =>
  typeof value === 'boolean' ? (value ? 'supported' : 'unsupported') : undefined;

const extractItems = (data: unknown): unknown[] => {
  const record = asRecord(data);
  if (Array.isArray(record?.data)) {
    return record.data;
  }
  if (Array.isArray(record?.models)) {
    return record.models;
  }
  return [];
};

const metadataFromGemini = (item: unknown): ProviderModelMetadata | null => {
  const record = asRecord(item);
  const id =
    typeof record?.baseModelId === 'string'
      ? record.baseModelId
      : typeof record?.name === 'string'
        ? record.name.replace(/^models\//, '')
        : '';
  if (!id) {
    return null;
  }
  const methods = readStringArray(record?.supportedGenerationMethods);
  if (methods.length > 0 && !methods.includes('generateContent')) {
    return null;
  }
  const inputTokenLimit = readPositiveNumber(record?.inputTokenLimit);
  const outputTokenLimit = readPositiveNumber(record?.outputTokenLimit);
  const temperature = readFiniteNumber(record?.temperature);
  const maxTemperature = readFiniteNumber(record?.maxTemperature);
  const thinking = typeof record?.thinking === 'boolean' ? record.thinking : undefined;
  return {
    id,
    ...(typeof record?.displayName === 'string' ? { displayName: record.displayName } : {}),
    ...(inputTokenLimit !== undefined ? { contextWindow: inputTokenLimit } : {}),
    ...(outputTokenLimit !== undefined ? { maxOutputTokens: outputTokenLimit } : {}),
    parameters: {
      maxOutputTokens: {
        support: 'supported',
        min: 1,
        ...(outputTokenLimit !== undefined ? { max: outputTokenLimit } : {}),
      },
      temperature: {
        support: 'supported',
        min: 0,
        ...(temperature !== undefined ? { default: temperature } : {}),
        ...(maxTemperature !== undefined ? { max: maxTemperature } : {}),
      },
      ...(thinking !== undefined
        ? { reasoning: { support: thinking ? 'supported' : 'unsupported' } }
        : {}),
    },
  };
};

const metadataFromKimi = (item: unknown): ProviderModelMetadata | null => {
  const record = asRecord(item);
  const id = typeof record?.id === 'string' ? record.id : '';
  if (!id) {
    return null;
  }
  const contextWindow = readPositiveNumber(record?.context_length);
  const image = supportFromBoolean(record?.supports_image_in);
  const video = supportFromBoolean(record?.supports_video_in);
  const reasoning = supportFromBoolean(record?.supports_reasoning);
  return {
    id,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    inputs: {
      ...(image !== undefined ? { image } : {}),
      ...(video !== undefined ? { video } : {}),
    },
    parameters: {
      ...(reasoning !== undefined ? { reasoning: { support: reasoning } } : {}),
    },
  };
};

const metadataFromAnthropic = (item: unknown): ProviderModelMetadata | null => {
  const record = asRecord(item);
  const id = typeof record?.id === 'string' ? record.id : '';
  if (!id) {
    return null;
  }
  const capabilities = asRecord(record?.capabilities);
  const image = supportFromBoolean(asRecord(capabilities?.image_input)?.supported);
  const pdf = supportFromBoolean(asRecord(capabilities?.pdf_input)?.supported);
  const thinking = asRecord(capabilities?.thinking);
  const reasoning = supportFromBoolean(thinking?.supported);
  const thinkingTypes = asRecord(thinking?.types);
  const reasoningModes = Object.entries(thinkingTypes ?? {})
    .filter(([, value]) => asRecord(value)?.supported === true)
    .map(([name]) => name);
  const contextWindow = readPositiveNumber(record?.max_input_tokens);
  const maxOutputTokens = readPositiveNumber(record?.max_tokens);
  return {
    id,
    ...(typeof record?.display_name === 'string' ? { displayName: record.display_name } : {}),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    inputs: {
      ...(image !== undefined ? { image } : {}),
      ...(pdf !== undefined ? { pdf } : {}),
    },
    parameters: {
      ...(maxOutputTokens !== undefined
        ? {
            maxOutputTokens: { support: 'supported', min: 1, max: maxOutputTokens },
          }
        : {}),
      ...(reasoning !== undefined
        ? {
            reasoning: {
              support: reasoning,
              ...(reasoningModes.length > 0 ? { modes: reasoningModes } : {}),
            },
          }
        : {}),
    },
  };
};

const metadataFromXai = (item: unknown): ProviderModelMetadata | null => {
  const record = asRecord(item);
  const id = typeof record?.id === 'string' ? record.id : '';
  if (!id) {
    return null;
  }
  const inputModalities = readStringArray(record?.input_modalities).map((value) =>
    value.toLowerCase(),
  );
  const modalitySupport = (name: string): CapabilitySupport | undefined =>
    inputModalities.length > 0
      ? inputModalities.includes(name)
        ? 'supported'
        : 'unsupported'
      : undefined;
  const image = modalitySupport('image');
  const pdf = modalitySupport('pdf');
  const video = modalitySupport('video');
  return {
    id,
    ...(typeof record?.name === 'string' ? { displayName: record.name } : {}),
    inputs: {
      ...(image !== undefined ? { image } : {}),
      ...(pdf !== undefined ? { pdf } : {}),
      ...(video !== undefined ? { video } : {}),
    },
  };
};

const metadataFromBasicModel = (item: unknown): ProviderModelMetadata | null => {
  if (typeof item === 'string') {
    return { id: item };
  }
  const record = asRecord(item);
  const id = typeof record?.id === 'string' ? record.id : '';
  if (!id) {
    return null;
  }
  return {
    id,
    ...(typeof record?.display_name === 'string' ? { displayName: record.display_name } : {}),
  };
};

export const buildAiModelDescriptorsFromProviderResponse = (
  provider: AiModelProvider,
  data: unknown,
): AiModelDescriptor[] => {
  const items = extractItems(data);
  const metadata = items
    .map((item) => {
      if (provider === 'gemini') {
        return metadataFromGemini(item);
      }
      if (provider === 'kimi') {
        return metadataFromKimi(item);
      }
      if (provider === 'anthropic') {
        return metadataFromAnthropic(item);
      }
      if (provider === 'grok') {
        return metadataFromXai(item);
      }
      return metadataFromBasicModel(item);
    })
    .filter((item): item is ProviderModelMetadata => Boolean(item));
  return resolveAiModelDescriptors(provider, metadata);
};
