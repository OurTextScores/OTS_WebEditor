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

  it('covers point releases and siblings, not just the exact ID reviewed', () => {
    /*
        The rules for the Claude 5 generation were written as exact matches on
        the IDs that existed at the time, so claude-fable-5-1 and claude-opus-5
        shipped to production resolving to unknown: the editor refused a score
        image, a PDF, or any custom max output against the newest models it
        offered. Same shape on Gemini, whose 3.x branch was pinned to 3.0/3.1.
        A rule that cannot survive a point release is the bug, so pin that.
    */
    const generation = [
      ['anthropic', 'claude-opus-5'],
      ['anthropic', 'claude-sonnet-5'],
      ['anthropic', 'claude-fable-5'],
      ['anthropic', 'claude-fable-5-1'],
      ['anthropic', 'claude-opus-4-5-20251101'],
      ['openai', 'gpt-6-astra'],
      ['gemini', 'gemini-3.6-flash'],
      ['gemini', 'gemini-3.8-flash'],
    ] as const;

    for (const [provider, model] of generation) {
      const descriptor = resolveAiModelDescriptor(provider, model);
      expect(descriptor.source, model).toBe('registry');
      expect(descriptor.inputs.image, model).toBe('supported');
      expect(descriptor.inputs.pdf, model).toBe('supported');
      expect(
        validateAiModelRequest(provider, model, { hasImage: true, hasPdf: true }).ok,
        model,
      ).toBe(true);
    }

    // Fable thinks adaptively and cannot be told not to; the rest of the
    // generation may turn it off. The exception declares only that, and
    // inherits the family's limits.
    expect(
      resolveAiModelDescriptor('anthropic', 'claude-fable-5-1').parameters.reasoning.modes,
    ).toEqual(['adaptive']);
    expect(
      resolveAiModelDescriptor('anthropic', 'claude-opus-5').parameters.reasoning.modes,
    ).toEqual(['off', 'adaptive']);
    expect(resolveAiModelDescriptor('anthropic', 'claude-fable-5-1').maxOutputTokens).toBe(128_000);

    // Opus 4.5 is an older generation and keeps its own smaller limits and its
    // manual thinking, rather than inheriting the 5 family's.
    const opus45 = resolveAiModelDescriptor('anthropic', 'claude-opus-4-5-20251101');
    expect(opus45.contextWindow).toBe(200_000);
    expect(opus45.maxOutputTokens).toBe(64_000);
    expect(opus45.parameters.temperature.support).toBe('supported');
    expect(opus45.parameters.reasoning.modes).toEqual(['off', 'enabled']);

    // GPT-6 follows the GPT-5 reasoning contract: no sampling control.
    expect(resolveAiModelDescriptor('openai', 'gpt-6-astra').parameters.temperature.support).toBe(
      'unsupported',
    );

    // Gemini's -lite is deliberately not in the flash rule: its reasoning
    // support is unconfirmed, so it inherits the family and stays unknown.
    expect(
      resolveAiModelDescriptor('gemini', 'gemini-3.5-flash-lite').parameters.reasoning.support,
    ).toBe('unknown');
  });

  it('resolves the reviewed unmatched model additions', () => {
    const cases = [
      ['anthropic', 'claude-fable-5', 'anthropic-claude-5'],
      ['anthropic', 'claude-opus-4-6', 'anthropic-opus-4-6'],
      ['anthropic', 'claude-sonnet-5', 'anthropic-claude-5'],
      ['gemini', 'gemini-3.5-flash', 'gemini-3-x-flash'],
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
