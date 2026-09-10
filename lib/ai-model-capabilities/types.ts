export type AiModelProvider = 'openai' | 'anthropic' | 'gemini' | 'grok' | 'deepseek' | 'kimi';

export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';
export type CapabilitySource = 'provider' | 'registry' | 'merged' | 'unknown';

export type NumericParameterCapability = {
  support: CapabilitySupport;
  min?: number;
  max?: number;
  default?: number;
  fixed?: number;
};
export type ReasoningCapability = {
  support: CapabilitySupport;
  modes?: string[];
  default?: string;
};

export type AiModelDescriptor = {
  id: string;
  provider: AiModelProvider;
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputs: {
    text: CapabilitySupport;
    image: CapabilitySupport;
    pdf: CapabilitySupport;
    video: CapabilitySupport;
  };
  parameters: {
    maxOutputTokens: NumericParameterCapability;
    temperature: NumericParameterCapability;
    reasoning: ReasoningCapability;
  };
  source: CapabilitySource;
  registryVersion: string;
  matchedRules: string[];
};

export type AiModelCapabilityPatch = {
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputs?: Partial<AiModelDescriptor['inputs']>;
  parameters?: {
    maxOutputTokens?: Partial<NumericParameterCapability>;
    temperature?: Partial<NumericParameterCapability>;
    reasoning?: Partial<ReasoningCapability>;
  };
};

export type ProviderModelMetadata = AiModelCapabilityPatch & {
  id: string;
};

export type AiModelRegistryRule = {
  id: string;
  provider: AiModelProvider;
  modelPattern: string;
  capabilities: AiModelCapabilityPatch;
  evidence: {
    url: string;
    verifiedAt: string;
    note?: string;
  };
};
