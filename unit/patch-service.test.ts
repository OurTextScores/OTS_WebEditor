import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderRequestError, requestAiTextDirect } from '../lib/ai-provider-adapters';

const mocked = vi.hoisted(() => ({
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/score-artifacts', () => ({
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import {
  applyMusicXmlPatch,
  generateApplyVerifiedPatch,
  parseMusicXmlPatch,
  resolvePatchGenerationBudget,
  runMusicPatchService,
} from '../lib/music-services/patch-service';

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><rest/><duration>1</duration><type>quarter</type></note></measure></part>
</score-partwise>`;

const validPatchText = (annotations?: unknown[]) =>
  JSON.stringify({
    format: 'musicxml-patch@1',
    ops: [
      {
        op: 'setText',
        path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note/duration',
        value: '2',
      },
    ],
    ...(annotations ? { annotations } : {}),
  });

const PATCH_ENV_KEYS = [
  'MUSIC_PATCH_MAX_ATTEMPTS',
  'MUSIC_PATCH_TRANSPORT_RETRIES',
  'MUSIC_PATCH_BUDGET_MS',
  'MUSIC_AI_REQUEST_TIMEOUT_MS',
  'MUSIC_PATCH_TRANSPORT_RETRY_DELAY_MS',
  'MUSIC_PATCH_MAX_CONTENT_BYTES',
  'MUSIC_PATCH_MAX_PROMPT_CHARS',
  'MUSIC_PATCH_MAX_IMAGE_BYTES',
  'MUSIC_PATCH_MAX_PDF_BYTES',
  'MUSIC_PATCH_MAX_CANDIDATE_CHARS',
  'MUSIC_PATCH_MAX_OUTPUT_BYTES',
  'MUSIC_PATCH_MODEL_REFRESH_COOLDOWN_MS',
  'MUSIC_PATCH_MODEL_REFRESH_TIMEOUT_MS',
  'MUSIC_PATCH_MODEL_REFRESH_GLOBAL_LIMIT',
  'ALLOW_SERVER_LLM_KEYS',
];

describe('runMusicPatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ALLOW_SERVER_LLM_KEYS;
  });

  afterEach(() => {
    PATCH_ENV_KEYS.forEach((key) => delete process.env[key]);
    vi.restoreAllMocks();
  });

  it('returns 400 when prompt is missing', async () => {
    const result = await runMusicPatchService({
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing prompt for music patch generation.',
    });
  });

  it('returns dry-run response without calling OpenAI', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: '<score-partwise version="4.0"></score-partwise>',
      dryRun: true,
      model: 'gpt-5.5',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: false,
      request: {
        model: 'gpt-5.5',
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when no API key is provided for non-dry-run requests', async () => {
    const result = await runMusicPatchService({
      prompt: 'Remove CLEAN VERSION text',
      content: '<score-partwise version="4.0"></score-partwise>',
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing OpenAI API key for music patch generation.',
    });
  });

  it('does not use a server API key unless server credential fallback is enabled', async () => {
    process.env.OPENAI_API_KEY = 'sk-server';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runMusicPatchService({
      prompt: 'Remove CLEAN VERSION text',
      content: '<score-partwise version="4.0"></score-partwise>',
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: 'Missing OpenAI API key for music patch generation.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects non-MusicXML and malformed MusicXML before calling a provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const nonMusicXml = await runMusicPatchService({
      prompt: 'Change it.',
      content: '<html></html>',
      apiKey: 'sk-test',
    });
    const malformedMusicXml = await runMusicPatchService({
      prompt: 'Change it.',
      content: '<score-partwise><part></score-partwise>',
      apiKey: 'sk-test',
    });

    expect(nonMusicXml.status).toBe(400);
    expect(nonMusicXml.body).toMatchObject({
      error: {
        code: 'invalid_request',
        message: 'Input does not look like MusicXML, ABC, or **kern.',
      },
    });
    expect(malformedMusicXml.status).toBe(400);
    expect(malformedMusicXml.body).toMatchObject({ error: 'Base MusicXML is not valid XML.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects oversized attachments before calling a provider', async () => {
    process.env.MUSIC_PATCH_MAX_IMAGE_BYTES = '1000';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await runMusicPatchService({
      prompt: 'Change it.',
      content: BASE_XML,
      apiKey: 'sk-test',
      image: {
        mediaType: 'image/png',
        base64: Buffer.alloc(1001).toString('base64'),
      },
    });

    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ error: 'Image attachment exceeds the 1000 byte limit.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 422 when model response is not a patch payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [{ type: 'message', content: [{ text: '{"oops":true}' }] }],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Fix beaming in measure 29',
      content: '<score-partwise version="4.0"></score-partwise>',
      apiKey: 'sk-test',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({
      error: 'Model response is not a musicxml-patch@1 payload.',
      verification: {
        level: 'patch_apply',
        attempts: 3,
        llmCalls: 3,
      },
    });
  });

  it('returns parsed patch for successful OpenAI responses output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: 'message',
            content: [
              {
                text: validPatchText(),
              },
            ],
          },
        ],
      }),
    } as Response);

    const result = await runMusicPatchService({
      prompt: 'Change key signature to G major',
      content: BASE_XML,
      apiKey: 'sk-test',
      model: 'gpt-5.5',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      mode: 'openai-responses',
      model: 'gpt-5.5',
      patch: {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'setText',
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note/duration',
            value: '2',
          },
        ],
      },
      proposedXml: expect.stringContaining('<duration>2</duration>'),
      proposal: {
        sourceTool: 'music.patch',
        baseXml: BASE_XML,
        proposedXml: expect.stringContaining('<duration>2</duration>'),
        baseIdentityHash: expect.stringMatching(/^xmlid-v1:[a-f0-9]{64}$/),
        expectedCurrentIdentityHash: expect.stringMatching(/^xmlid-v1:[a-f0-9]{64}$/),
      },
      verification: {
        level: 'patch_apply',
        attempts: 1,
        llmCalls: 1,
      },
    });
    expect(result.body.resolvedBase).toBeUndefined();
  });

  it('refreshes provider metadata before authorizing options for an otherwise unknown model', async () => {
    const model = 'gemini-live-metadata-test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v1beta/models')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: `models/${model}`,
                baseModelId: model,
                inputTokenLimit: 32_768,
                outputTokenLimit: 4_096,
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          { status: 200 },
        );
      }
      expect(url).toContain(`models/${model}:generateContent`);
      expect(JSON.parse(String(init?.body))).toMatchObject({
        generationConfig: { maxOutputTokens: 2_048 },
      });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: validPatchText() }] } }],
        }),
        { status: 200 },
      );
    });

    const result = await runMusicPatchService({
      prompt: 'Fix the duration.',
      content: BASE_XML,
      provider: 'gemini',
      apiKey: 'gemini-live-metadata-key',
      model,
      maxTokens: 2_048,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      modelDescriptor: {
        id: model,
        source: 'provider',
        parameters: { maxOutputTokens: { support: 'supported', max: 4_096 } },
      },
      verification: { attempts: 1, llmCalls: 1 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('re-looks up each model after piggybacking on a shared metadata refresh', async () => {
    const models = ['gemini-concurrent-model-a', 'gemini-concurrent-model-b'];
    let releaseModelList: (() => void) | undefined;
    let markModelListStarted: (() => void) | undefined;
    const modelListStarted = new Promise<void>((resolve) => {
      markModelListStarted = resolve;
    });
    const modelListPaused = new Promise<void>((resolve) => {
      releaseModelList = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1beta/models')) {
        markModelListStarted?.();
        await modelListPaused;
        return new Response(
          JSON.stringify({
            models: models.map((model, index) => ({
              name: `models/${model}`,
              baseModelId: model,
              inputTokenLimit: 32_768,
              outputTokenLimit: 4_096 * (index + 1),
              supportedGenerationMethods: ['generateContent'],
            })),
          }),
          { status: 200 },
        );
      }
      expect(models.some((model) => url.includes(`models/${model}:generateContent`))).toBe(true);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: validPatchText() }] } }],
        }),
        { status: 200 },
      );
    });
    const request = (model: string) =>
      runMusicPatchService({
        prompt: 'Fix the duration.',
        content: BASE_XML,
        provider: 'gemini',
        apiKey: 'gemini-shared-concurrent-key',
        model,
        maxTokens: 2_048,
      });

    const first = request(models[0]);
    await modelListStarted;
    const second = request(models[1]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseModelList?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.status).toBe(200);
    expect(secondResult.status).toBe(200);
    expect(firstResult.body.modelDescriptor).toMatchObject({ id: models[0] });
    expect(secondResult.body.modelDescriptor).toMatchObject({ id: models[1] });
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input).endsWith('/v1beta/models')),
    ).toHaveLength(1);
  });

  it('fails closed with zero LLM calls when metadata refresh fails and ignores a client descriptor hint', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unavailable', { status: 503 }));
    const model = 'gemini-unconfirmed-client-hint-test';

    const result = await runMusicPatchService({
      prompt: 'Fix the duration.',
      content: BASE_XML,
      provider: 'gemini',
      apiKey: 'gemini-refresh-failure-key',
      model,
      maxTokens: 2_048,
      modelDescriptor: {
        id: model,
        provider: 'gemini',
        parameters: { maxOutputTokens: { support: 'supported' } },
      },
    });
    const repeatedResult = await runMusicPatchService({
      prompt: 'Fix the duration.',
      content: BASE_XML,
      provider: 'gemini',
      apiKey: 'gemini-refresh-failure-key',
      model,
      maxTokens: 2_048,
    });

    expect(result.status).toBe(400);
    expect(repeatedResult.status).toBe(400);
    expect(result.body).toMatchObject({
      error: `Custom max output is not confirmed for model ${model}. Use Auto.`,
      modelDescriptor: { id: model, source: 'unknown' },
    });
    expect(result.body.verification).toBeUndefined();
    expect(repeatedResult.body.verification).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[patch-service] Model metadata refresh failed.',
      expect.objectContaining({ provider: 'gemini', model }),
    );
  });
});

describe('generateApplyVerifiedPatch', () => {
  afterEach(() => {
    PATCH_ENV_KEYS.forEach((key) => delete process.env[key]);
  });

  it('resolves effort profiles without weakening deployment caps', () => {
    expect(resolvePatchGenerationBudget('efficient')).toEqual({
      maxAttempts: 1,
      budgetMs: 60_000,
      requestTimeoutMs: 45_000,
    });
    expect(resolvePatchGenerationBudget('thorough')).toEqual({
      maxAttempts: 5,
      budgetMs: 300_000,
      requestTimeoutMs: 120_000,
    });

    process.env.MUSIC_PATCH_MAX_ATTEMPTS = '2';
    process.env.MUSIC_PATCH_BUDGET_MS = '90000';
    process.env.MUSIC_AI_REQUEST_TIMEOUT_MS = '50000';
    expect(resolvePatchGenerationBudget('thorough')).toEqual({
      maxAttempts: 2,
      budgetMs: 90_000,
      requestTimeoutMs: 50_000,
    });
  });

  it('uses one candidate attempt for the efficient profile', async () => {
    const requestText = vi.fn(
      async (
        args: Parameters<
          NonNullable<Parameters<typeof generateApplyVerifiedPatch>[0]['requestText']>
        >[0],
      ) => {
        args.onRequest?.();
        return 'not json';
      },
    );
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      effort: 'efficient',
      requestText,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      verification: {
        effort: 'efficient',
        attempts: 1,
        llmCalls: 1,
        budget: { maxAttempts: 1, budgetMs: 60_000, requestTimeoutMs: 45_000 },
      },
    });
    expect(requestText).toHaveBeenCalledTimes(1);
  });

  it('reports provider and patch-verification milestones without candidate content', async () => {
    const progress: Array<Record<string, unknown>> = [];
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      onProgress: (event) => progress.push(event),
      requestText: async (args) => {
        args.onRequest?.();
        return validPatchText();
      },
    });

    expect(result.ok).toBe(true);
    expect(progress.map((event) => event.phase)).toEqual([
      'provider.attempt_started',
      'candidate.received',
      'patch.applied',
    ]);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'patch.applied',
        verificationLevel: 'patch_apply',
        attempt: 1,
        llmCalls: 1,
      }),
    );
    expect(JSON.stringify(progress)).not.toContain('<score-partwise');
  });

  it('includes the failed candidate and exact XPath error when repairing', async () => {
    const prompts: string[] = [];
    const badCandidate = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [{ op: 'setText', path: '/score-partwise/part[@id="P9"]', value: 'bad' }],
    });
    const responses = [badCandidate, validPatchText()];
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText: async (args) => {
        args.onRequest?.();
        prompts.push(args.promptText);
        return responses.shift() || '';
      },
    });

    expect(result.ok).toBe(true);
    expect(result.verification).toMatchObject({ attempts: 2, llmCalls: 2 });
    expect(prompts[1]).toContain(badCandidate);
    expect(prompts[1]).toContain(
      'Patch op 1 failed: XPath "/score-partwise/part[@id=\"P9\"]" matched 0 nodes.',
    );
  });

  it('repairs malformed JSON and preserves annotations from the successful candidate', async () => {
    const annotations = [{ partIndex: 0, measure: 1, comment: 'Lengthened the rest.' }];
    const responses = ['not json', validPatchText(annotations)];
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText: async (args) => {
        args.onRequest?.();
        return responses.shift() || '';
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.annotations).toEqual(annotations);
      expect(result.proposedXml).toContain('<duration>2</duration>');
    }
  });

  it('returns a bounded 422 after the configured candidate attempts', async () => {
    process.env.MUSIC_PATCH_MAX_ATTEMPTS = '2';
    const requestText = vi.fn(
      async (
        args: Parameters<
          NonNullable<Parameters<typeof generateApplyVerifiedPatch>[0]['requestText']>
        >[0],
      ) => {
        args.onRequest?.();
        return 'not json';
      },
    );
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      verification: { attempts: 2, llmCalls: 2 },
    });
    expect(requestText).toHaveBeenCalledTimes(2);
  });

  it('counts a transport retry as a second LLM call but one candidate attempt', async () => {
    process.env.MUSIC_PATCH_TRANSPORT_RETRY_DELAY_MS = '0';
    let call = 0;
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText: async (args) => {
        args.onRequest?.();
        call += 1;
        if (call === 1) {
          throw new AiProviderRequestError('temporary provider failure', {
            requestStarted: true,
            retryable: true,
            status: 503,
          });
        }
        return validPatchText();
      },
    });

    expect(result.ok).toBe(true);
    expect(result.verification).toMatchObject({ attempts: 1, llmCalls: 2 });
  });

  it('does not retry a typed non-retryable provider error', async () => {
    process.env.MUSIC_PATCH_TRANSPORT_RETRIES = '3';
    const requestText = vi.fn(
      async (
        args: Parameters<
          NonNullable<Parameters<typeof generateApplyVerifiedPatch>[0]['requestText']>
        >[0],
      ) => {
        args.onRequest?.();
        throw new AiProviderRequestError('invalid credentials', {
          requestStarted: true,
          retryable: false,
          status: 401,
        });
      },
    );

    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      error: 'AI provider request failed (HTTP 401): invalid credentials',
      providerStatus: 401,
      verification: { attempts: 0, llmCalls: 1 },
    });
    expect(requestText).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight provider request at the configured deadline', async () => {
    process.env.MUSIC_PATCH_BUDGET_MS = '20';
    process.env.MUSIC_AI_REQUEST_TIMEOUT_MS = '20';
    process.env.MUSIC_PATCH_TRANSPORT_RETRIES = '0';
    const result = await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      requestText: (args) =>
        new Promise((_, reject) => {
          args.onRequest?.();
          args.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    });

    expect(result).toMatchObject({
      ok: false,
      status: 504,
      verification: { attempts: 0, llmCalls: 1 },
    });
  });

  it('forwards image and PDF attachments to the provider request', async () => {
    const requestText = vi.fn(
      async (
        args: Parameters<
          NonNullable<Parameters<typeof generateApplyVerifiedPatch>[0]['requestText']>
        >[0],
      ) => {
        args.onRequest?.();
        return validPatchText();
      },
    );
    await generateApplyVerifiedPatch({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseXml: BASE_XML,
      promptText: 'Fix the duration.',
      maxTokens: null,
      image: { mediaType: 'image/png', base64: 'aW1hZ2U=' },
      pdf: { mediaType: 'application/pdf', base64: 'cGRm', filename: 'score.pdf' },
      requestText,
    });

    expect(requestText).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mediaType: 'image/png', base64: 'aW1hZ2U=' },
        pdf: { mediaType: 'application/pdf', base64: 'cGRm', filename: 'score.pdf' },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe('requestAiTextDirect error metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves both Responses and Chat fallback rejection details', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'This model requires a different input shape.' },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'This model is unavailable on Chat Completions.' },
          }),
          { status: 404 },
        ),
      );

    await expect(
      requestAiTextDirect({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4.1',
        promptText: 'test',
        systemPrompt: 'test',
        maxTokens: null,
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining(
        'Responses API HTTP 400: This model requires a different input shape.',
      ),
    });
  });

  it('marks capability failures as not started and non-retryable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let caught: unknown;
    try {
      await requestAiTextDirect({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'unknown-model',
        promptText: 'test',
        systemPrompt: 'test',
        maxTokens: 1_000,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiProviderRequestError);
    expect(caught).toMatchObject({ requestStarted: false, retryable: false, status: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks retryable provider responses after a request starts', async () => {
    const onRequest = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('busy', { status: 503 }),
    );
    let caught: unknown;
    try {
      await requestAiTextDirect({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4.1',
        promptText: 'test',
        systemPrompt: 'test',
        maxTokens: null,
        onRequest,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiProviderRequestError);
    expect(caught).toMatchObject({ requestStarted: true, retryable: true, status: 503 });
    expect(onRequest).toHaveBeenCalledTimes(2);
  });
});

describe('applyMusicXmlPatch', () => {
  it('rejects every operation when its XPath matches multiple nodes', async () => {
    const multiNoteXml = BASE_XML.replace(
      '</measure>',
      '<note><rest/><duration>1</duration><type>quarter</type></note></measure>',
    );

    for (const op of ['setText', 'setAttr', 'delete'] as const) {
      const result = await applyMusicXmlPatch(multiNoteXml, {
        format: 'musicxml-patch@1',
        ops: [
          {
            op,
            path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note',
            ...(op === 'setText' ? { value: 'changed' } : {}),
            ...(op === 'setAttr' ? { name: 'color', value: '#000000' } : {}),
          },
        ],
      });

      expect(result.xml).toBe('');
      expect(result.error).toContain('matched 2 nodes');
    }
  });

  it('creates missing measure attributes chain for clef setText targets', async () => {
    const baseXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

    const patch = {
      format: 'musicxml-patch@1' as const,
      ops: [
        {
          op: 'setText' as const,
          path: '/score-partwise/part[@id="P1"]/measure[@number="2"]/attributes/clef/sign',
          value: 'G',
        },
        {
          op: 'setText' as const,
          path: '/score-partwise/part[@id="P1"]/measure[@number="2"]/attributes/clef/line',
          value: '2',
        },
      ],
    };

    const result = await applyMusicXmlPatch(baseXml, patch);

    expect(result.error).toBe('');
    expect(result.xml).toContain('<measure number="1">');
    expect(result.xml).toContain('<fifths>1</fifths>');
    expect(result.xml).toMatch(
      /<measure number="2">[\s\S]*?<attributes><clef><sign>G<\/sign><line>2<\/line><\/clef><\/attributes>/,
    );
  });
});

describe('parseMusicXmlPatch', () => {
  it('rejects replace values with multiple top-level elements', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'replace',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]',
          value:
            '<note><pitch><step>C</step><octave>4</octave></pitch></note><backup><duration>1</duration></backup>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('expected exactly one');
  });

  it('rejects replace values with top-level text', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'replace',
          path: '/score-partwise/part[@id="P1"]/measure[@number="1"]/note[1]',
          value: 'text<note><pitch><step>C</step><octave>4</octave></pitch></note>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('top-level text');
  });

  it('rejects setText values that contain XML markup', () => {
    const payload = JSON.stringify({
      format: 'musicxml-patch@1',
      ops: [
        {
          op: 'setText',
          path: '/score-partwise/part[@id="P1"]/measure[@number="39"]/attributes',
          value: '<clef><sign>G</sign><line>2</line></clef>',
        },
      ],
    });
    const parsed = parseMusicXmlPatch(payload);
    expect(parsed.patch).toBeNull();
    expect(parsed.error).toContain('setText value appears to contain XML');
  });
});
