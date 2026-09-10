import { describe, expect, it } from 'vitest';
import {
  buildAiModelDescriptorsFromProviderResponse,
  detectUnsupportedAiRequestParameter,
  resolveAiModelDescriptor,
  validateAiModelRequest,
} from '../lib/ai-model-capabilities';

describe('AI model capabilities', () => {
  it('uses conservative controls for an unknown manually entered model', () => {
    const descriptor = resolveAiModelDescriptor('openai', 'custom-model');

    expect(descriptor.source).toBe('unknown');
    expect(descriptor.inputs.text).toBe('supported');
    expect(descriptor.inputs.image).toBe('unknown');
    expect(descriptor.parameters.maxOutputTokens.support).toBe('unknown');
    expect(descriptor.parameters.temperature.support).toBe('unknown');
    expect(validateAiModelRequest('openai', descriptor.id, { maxTokens: 1000 }).ok).toBe(false);
    expect(validateAiModelRequest('openai', descriptor.id, { hasImage: true }).ok).toBe(false);
  });

  it('disables temperature for Claude Opus 4.8 while retaining known inputs', () => {
    const descriptor = resolveAiModelDescriptor('anthropic', 'claude-opus-4-8');

    expect(descriptor.source).toBe('registry');
    expect(descriptor.inputs.image).toBe('supported');
    expect(descriptor.inputs.pdf).toBe('supported');
    expect(descriptor.parameters.temperature.support).toBe('unsupported');
    expect(validateAiModelRequest('anthropic', descriptor.id, { temperature: 0 }).error).toContain(
      'Temperature is not supported',
    );
  });

  it('resolves the reviewed unmatched model additions', () => {
    const cases = [
      ['anthropic', 'claude-fable-5', 'anthropic-fable-5'],
      ['anthropic', 'claude-opus-4-6', 'anthropic-opus-4-6'],
      ['anthropic', 'claude-sonnet-5', 'anthropic-sonnet-5'],
      ['gemini', 'gemini-3.5-flash', 'gemini-3-5-flash'],
      ['deepseek', 'deepseek-v4-flash', 'deepseek-v4'],
      ['deepseek', 'deepseek-v4-pro', 'deepseek-v4'],
      ['kimi', 'kimi-k2.7-code', 'kimi-k2-7-code'],
      ['kimi', 'kimi-k2.7-code-highspeed', 'kimi-k2-7-code'],
      ['kimi', 'kimi-k3', 'kimi-k3'],
    ] as const;

    for (const [provider, model, rule] of cases) {
      expect(resolveAiModelDescriptor(provider, model).matchedRules).toContain(rule);
    }

    expect(
      resolveAiModelDescriptor('anthropic', 'claude-opus-4-6').parameters.temperature.support,
    ).toBe('supported');
    expect(
      resolveAiModelDescriptor('anthropic', 'claude-sonnet-5').parameters.temperature.support,
    ).toBe('unsupported');
    expect(resolveAiModelDescriptor('gemini', 'gemini-3.5-flash').maxOutputTokens).toBe(65_536);
    expect(
      resolveAiModelDescriptor('deepseek', 'deepseek-v4-pro').parameters.reasoning.default,
    ).toBe('on');
    expect(
      resolveAiModelDescriptor('kimi', 'kimi-k2.7-code-highspeed').parameters.temperature.fixed,
    ).toBe(1);
    expect(resolveAiModelDescriptor('kimi', 'kimi-k3').maxOutputTokens).toBe(1_048_576);
  });

  it('merges Anthropic limits and capability flags from provider metadata', () => {
    const [descriptor] = buildAiModelDescriptorsFromProviderResponse('anthropic', {
      data: [
        {
          id: 'claude-sonnet-5',
          display_name: 'Claude Sonnet 5',
          max_input_tokens: 1_000_000,
          max_tokens: 131_072,
          capabilities: {
            image_input: { supported: true },
            pdf_input: { supported: true },
            thinking: {
              supported: true,
              types: {
                adaptive: { supported: true },
                enabled: { supported: false },
              },
            },
          },
        },
      ],
    });

    expect(descriptor.source).toBe('merged');
    expect(descriptor.contextWindow).toBe(1_000_000);
    expect(descriptor.maxOutputTokens).toBe(131_072);
    expect(descriptor.inputs.image).toBe('supported');
    expect(descriptor.inputs.pdf).toBe('supported');
    expect(descriptor.parameters.reasoning).toMatchObject({
      support: 'supported',
      modes: ['adaptive'],
    });
  });

  it('merges Gemini token and temperature limits from provider metadata', () => {
    const [descriptor] = buildAiModelDescriptorsFromProviderResponse('gemini', {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          baseModelId: 'gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          inputTokenLimit: 1_000_000,
          outputTokenLimit: 65_536,
          temperature: 1,
          maxTemperature: 2,
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });

    expect(descriptor.source).toBe('merged');
    expect(descriptor.contextWindow).toBe(1_000_000);
    expect(descriptor.maxOutputTokens).toBe(65_536);
    expect(descriptor.parameters.temperature).toMatchObject({
      support: 'supported',
      default: 1,
      max: 2,
    });
    expect(
      validateAiModelRequest('gemini', descriptor.id, { maxTokens: 70_000 }, descriptor).error,
    ).toContain('cannot exceed 65536');
  });

  it('preserves Kimi model-list context and modality metadata', () => {
    const [descriptor] = buildAiModelDescriptorsFromProviderResponse('kimi', {
      data: [
        {
          id: 'kimi-k2.6',
          context_length: 262_144,
          supports_image_in: true,
          supports_video_in: true,
          supports_reasoning: true,
        },
      ],
    });

    expect(descriptor.contextWindow).toBe(262_144);
    expect(descriptor.inputs.image).toBe('supported');
    expect(descriptor.inputs.video).toBe('supported');
    expect(descriptor.parameters.reasoning.support).toBe('supported');
    expect(descriptor.parameters.temperature.support).toBe('unsupported');
  });

  it('filters Gemini models that cannot generate content', () => {
    const descriptors = buildAiModelDescriptorsFromProviderResponse('gemini', {
      models: [
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      ],
    });

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(['gemini-2.5-flash']);
  });

  it('normalizes only explicit optional-parameter rejection errors', () => {
    expect(
      detectUnsupportedAiRequestParameter({
        error: {
          message: "Unsupported parameter: 'temperature' is not supported with this model.",
        },
      }),
    ).toBe('temperature');
    expect(detectUnsupportedAiRequestParameter('max_output_tokens is an unknown parameter')).toBe(
      'maxOutputTokens',
    );
    expect(detectUnsupportedAiRequestParameter('Request exceeded the token limit')).toBeNull();
    expect(detectUnsupportedAiRequestParameter('Authentication failed')).toBeNull();
  });
});
