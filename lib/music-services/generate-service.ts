import {
    convertMusicNotation,
    type MusicConversionResult,
    type ValidationCheck,
} from '../music-conversion';
import {
    createScoreArtifact,
    getScoreArtifact,
    summarizeScoreArtifact,
    type ScoreArtifact,
} from '../score-artifacts';
import { type TraceContext, withTraceHeaders } from '../trace-http';

const DEFAULT_NOTAGEN_MODEL_ID = (process.env.MUSIC_NOTAGEN_DEFAULT_MODEL_ID || '').trim();
const DEFAULT_NOTAGEN_REVISION = (process.env.MUSIC_NOTAGEN_DEFAULT_REVISION || '').trim();
const DEFAULT_NOTAGEN_SPACE_ID = (process.env.MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen').trim();
const DEFAULT_NOTAGEN_SPACE_TOKEN = (process.env.MUSIC_NOTAGEN_SPACE_TOKEN || '').trim();
const DEFAULT_HF_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_NEW_TOKENS = 512;
const DEFAULT_TEMPERATURE = 0.8;
const DEFAULT_TOP_P = 0.95;
const DEFAULT_PROMPT_SEED_ABC_CHAR_LIMIT = 8_000;
const DEFAULT_OUTPUT_ABC_CHAR_LIMIT = 24_000;
const DEFAULT_NOTAGEN_SPACE_TIMEOUT_MS = 300_000;
const DEFAULT_NOTAGEN_SPACE_PERIOD = (process.env.MUSIC_NOTAGEN_SPACE_DEFAULT_PERIOD || 'Classical').trim();
const DEFAULT_NOTAGEN_SPACE_COMPOSER = (process.env.MUSIC_NOTAGEN_SPACE_DEFAULT_COMPOSER || 'Mozart, Wolfgang Amadeus').trim();
const DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION = (process.env.MUSIC_NOTAGEN_SPACE_DEFAULT_INSTRUMENTATION || 'Keyboard').trim();

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const readFiniteNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const readBoolean = (camel: unknown, snake: unknown, fallback: boolean) => {
    if (typeof camel === 'boolean') {
        return camel;
    }
    if (typeof snake === 'boolean') {
        return snake;
    }
    return fallback;
};

const maskToken = (token: string) => {
    if (!token) {
        return '';
    }
    if (token.length <= 8) {
        return `${token.slice(0, 2)}***`;
    }
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

const truncateText = (value: string, maxChars: number) => {
    if (maxChars <= 0 || value.length <= maxChars) {
        return { text: value, truncated: false };
    }
    return {
        text: `${value.slice(0, maxChars)}\n% ...truncated...`,
        truncated: true,
    };
};

function getHfInferenceUrl(modelId: string, revision: string) {
    const base = `https://api-inference.huggingface.co/models/${encodeURIComponent(modelId)}`;
    return revision ? `${base}?revision=${encodeURIComponent(revision)}` : base;
}

type NotaGenBackend = 'huggingface' | 'huggingface-space';

function normalizeNotaGenBackend(value: string): NotaGenBackend | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === 'huggingface' || normalized === 'hf') {
        return 'huggingface';
    }
    if (normalized === 'huggingface-space' || normalized === 'hf-space' || normalized === 'space' || normalized === 'gradio-space') {
        return 'huggingface-space';
    }
    return null;
}

function parseHfGeneratedText(data: unknown, prompt: string): string {
    const stripPromptEcho = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.startsWith(prompt)) {
            return trimmed.slice(prompt.length).trim();
        }
        return trimmed;
    };

    if (typeof data === 'string') {
        return stripPromptEcho(data);
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const record = asRecord(item);
            const candidate = record && typeof record.generated_text === 'string'
                ? record.generated_text
                : (record && typeof record.text === 'string' ? record.text : '');
            if (candidate) {
                return stripPromptEcho(candidate);
            }
        }
    }

    const record = asRecord(data);
    if (!record) {
        return '';
    }
    if (typeof record.generated_text === 'string') {
        return stripPromptEcho(record.generated_text);
    }
    if (typeof record.text === 'string') {
        return stripPromptEcho(record.text);
    }
    return '';
}

function extractAbcFromGeneratedText(text: string): { abc: string | null; strategy: string } {
    const raw = text.trim();
    if (!raw) {
        return { abc: null, strategy: 'empty' };
    }

    const fenced = raw.match(/```(?:abc)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        const candidate = fenced[1].trim();
        if (candidate) {
            return { abc: candidate, strategy: 'code-fence' };
        }
    }

    const deChat = raw.replace(/^\s*Assistant:\s*/i, '').trim();
    const xIndex = deChat.search(/(^|\n)X:\s*\d+/m);
    if (xIndex >= 0) {
        const candidate = deChat.slice(xIndex).trim();
        return { abc: candidate, strategy: 'x-header-slice' };
    }

    if (/(^|\n)K:\s*\S+/m.test(deChat) && /[A-Ga-gzZ]/.test(deChat)) {
        return { abc: deChat, strategy: 'full-text-k-header' };
    }

    return { abc: null, strategy: 'unrecognized' };
}

function summarizeFailedWarnings(checks: ValidationCheck[]) {
    return checks
        .filter((check) => !check.ok && check.severity === 'warning')
        .map((check) => ({ id: check.id, message: check.message }));
}

function summarizeFailedErrors(checks: ValidationCheck[]) {
    return checks
        .filter((check) => !check.ok && check.severity === 'error')
        .map((check) => ({ id: check.id, message: check.message }));
}

function buildNotaGenPrompt(args: {
    prompt: string;
    seedAbc?: string;
    seedCharLimit: number;
}) {
    const seed = typeof args.seedAbc === 'string' && args.seedAbc.trim()
        ? truncateText(args.seedAbc, args.seedCharLimit)
        : null;

    const instructions = [
        'Generate a single musical score in valid ABC notation.',
        'Output ABC notation only. Do not include markdown fences or commentary.',
        'Include required ABC headers such as X:, T:, M:, L:, and K: when appropriate.',
        args.prompt ? `Task: ${args.prompt}` : 'Task: Compose a short coherent piece.',
    ];

    if (seed) {
        instructions.push('Use the following seed material as context or continuation reference:');
        instructions.push(seed.text);
    }

    const promptText = `${instructions.join('\n\n')}\n`;
    return {
        prompt: promptText,
        seedIncluded: Boolean(seed),
        seedCharsIncluded: seed ? seed.text.length : 0,
        seedCharsTotal: seed ? args.seedAbc?.length ?? 0 : 0,
        seedTruncatedForPrompt: seed ? seed.truncated : false,
    };
}

async function callHuggingFaceTextGeneration(args: {
    hfToken: string;
    modelId: string;
    revision: string;
    prompt: string;
    timeoutMs: number;
    maxNewTokens: number;
    temperature: number;
    topP: number;
    traceContext?: TraceContext;
}) {
    const endpoint = getHfInferenceUrl(args.modelId, args.revision);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: args.traceContext
                ? withTraceHeaders(args.traceContext, {
                    Authorization: `Bearer ${args.hfToken}`,
                    'Content-Type': 'application/json',
                })
                : {
                    Authorization: `Bearer ${args.hfToken}`,
                    'Content-Type': 'application/json',
                },
            body: JSON.stringify({
                inputs: args.prompt,
                parameters: {
                    max_new_tokens: args.maxNewTokens,
                    temperature: args.temperature,
                    top_p: args.topP,
                    return_full_text: false,
                },
                options: {
                    wait_for_model: true,
                },
            }),
            signal: controller.signal,
        });

        const text = await response.text();
        let parsed: unknown = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }

        if (!response.ok) {
            const record = asRecord(parsed);
            const errorMessage = typeof record?.error === 'string'
                ? record.error
                : `Hugging Face inference failed (${response.status}).`;
            throw new Error(errorMessage);
        }

        const generatedText = parseHfGeneratedText(parsed, args.prompt);
        if (!generatedText) {
            throw new Error('Hugging Face inference returned no generated text.');
        }

        return {
            endpoint,
            responseStatus: response.status,
            generatedText,
            raw: parsed,
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Hugging Face inference timed out after ${args.timeoutMs}ms.`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function extractGradioChoices(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
            if (Array.isArray(entry) && typeof entry[0] === 'string') {
                return entry[0];
            }
            if (typeof entry === 'string') {
                return entry;
            }
            return '';
        })
        .filter(Boolean);
}

function parseSpaceUpdateChoices(result: unknown): { composers: string[]; instrumentations: string[] } {
    if (!Array.isArray(result)) {
        return { composers: [], instrumentations: [] };
    }
    const first = asRecord(result[0]);
    const second = asRecord(result[1]);
    return {
        composers: extractGradioChoices(first?.choices),
        instrumentations: extractGradioChoices(second?.choices),
    };
}

function extractSpaceAbcFromGradioData(data: unknown): { abc: string | null; processOutput?: string; rawOutputs?: unknown[] } {
    if (!Array.isArray(data)) {
        return { abc: null };
    }
    const rawOutputs = data as unknown[];
    const processOutput = typeof rawOutputs[0] === 'string' ? rawOutputs[0] : undefined;
    const abcCandidate = typeof rawOutputs[1] === 'string' ? rawOutputs[1].trim() : '';
    if (!abcCandidate || abcCandidate === 'Converting files...') {
        return { abc: null, processOutput, rawOutputs };
    }
    if (/^Error converting files:/i.test(abcCandidate)) {
        return { abc: null, processOutput, rawOutputs };
    }
    return { abc: abcCandidate, processOutput, rawOutputs };
}

async function callNotaGenSpaceGeneration(args: {
    spaceId: string;
    hfToken?: string;
    period: string;
    composer: string;
    instrumentation: string;
    timeoutMs: number;
    traceContext?: TraceContext;
}) {
    const { Client } = await import('@gradio/client');
    const app = await Client.connect(args.spaceId, {
        events: ['data', 'status', 'log'],
        ...(args.hfToken ? { token: args.hfToken as `hf_${string}` } : {}),
        ...(args.traceContext ? { headers: withTraceHeaders(args.traceContext) } : {}),
    });

    const updatePeriod = await app.predict('/update_components', [args.period, null]);
    const periodChoices = parseSpaceUpdateChoices(updatePeriod?.data);
    if (periodChoices.composers.length > 0 && !periodChoices.composers.includes(args.composer)) {
        throw new Error(`Composer "${args.composer}" is not valid for period "${args.period}" in Space ${args.spaceId}.`);
    }

    const updateComposer = await app.predict('/update_components_1', [args.period, args.composer]);
    const composerChoices = parseSpaceUpdateChoices(updateComposer?.data);
    if (composerChoices.instrumentations.length > 0 && !composerChoices.instrumentations.includes(args.instrumentation)) {
        throw new Error(`Instrumentation "${args.instrumentation}" is not valid for ${args.period} / ${args.composer} in Space ${args.spaceId}.`);
    }

    const job = app.submit('/generate_music', [args.period, args.composer, args.instrumentation]);
    const startedAt = Date.now();
    let lastDataPayload: unknown = null;
    let lastNonEmptyAbc: string | null = null;
    let lastProcessOutput = '';
    let finalStatus: { stage?: string; success?: boolean; message?: unknown } | null = null;
    let sawFinalAbc = false;

    try {
        while (true) {
            const remainingMs = args.timeoutMs - (Date.now() - startedAt);
            if (remainingMs <= 0) {
                await job.cancel().catch(() => undefined);
                throw new Error(`Hugging Face Space generation timed out after ${args.timeoutMs}ms.`);
            }

            const nextResult = await Promise.race([
                job.next(),
                new Promise<never>((_, reject) => {
                    const timer = setTimeout(() => {
                        clearTimeout(timer);
                        reject(new Error(`Hugging Face Space generation timed out after ${args.timeoutMs}ms.`));
                    }, Math.max(1, remainingMs));
                }),
            ]);

            if (nextResult.done) {
                break;
            }

            const event = nextResult.value;
            const eventRecord = asRecord(event);
            const eventType = typeof eventRecord?.type === 'string' ? eventRecord.type : '';

            if (eventType === 'status') {
                finalStatus = {
                    stage: typeof eventRecord?.stage === 'string' ? eventRecord.stage : undefined,
                    success: typeof eventRecord?.success === 'boolean' ? eventRecord.success : undefined,
                    message: eventRecord?.message,
                };
                if (finalStatus.stage === 'error' || finalStatus.success === false) {
                    const message = typeof finalStatus.message === 'string'
                        ? finalStatus.message
                        : 'Hugging Face Space generation failed.';
                    throw new Error(message);
                }
                continue;
            }
            if (eventType !== 'data') {
                continue;
            }

            lastDataPayload = eventRecord?.data;
            const extracted = extractSpaceAbcFromGradioData(eventRecord?.data);
            if (typeof extracted.processOutput === 'string') {
                lastProcessOutput = extracted.processOutput;
            }
            if (extracted.abc) {
                lastNonEmptyAbc = extracted.abc;
                sawFinalAbc = true;
                // Gradio submit iterables can continue emitting status/heartbeat events after the
                // final data payload; return as soon as we have the final ABC.
                await job.cancel().catch(() => undefined);
                break;
            }
        }
    } catch (error) {
        await job.cancel().catch(() => undefined);
        throw error;
    } finally {
        app.close();
    }

    const extractedFinal = extractSpaceAbcFromGradioData(lastDataPayload);
    const generatedText = extractedFinal.abc || lastNonEmptyAbc || '';
    if (!generatedText) {
        const maybeErrorText = Array.isArray(lastDataPayload) && typeof lastDataPayload[1] === 'string'
            ? lastDataPayload[1]
            : '';
        if (maybeErrorText && /^Error converting files:/i.test(maybeErrorText)) {
            throw new Error(`NotaGen Space generation failed: ${maybeErrorText}`);
        }
        throw new Error(`NotaGen Space did not return ABC output.${finalStatus?.stage ? ` Final status: ${finalStatus.stage}.` : ''}`);
    }

    return {
        generatedText,
        responseStatus: 200,
        raw: {
            provider: 'huggingface-space',
            spaceId: args.spaceId,
            finalStatus,
            sawFinalAbc,
            processOutputPreview: lastProcessOutput.slice(0, 4000),
            lastDataPayload,
        },
    };
}

type PreparedSeed = {
    seedArtifact: ScoreArtifact;
    seedAbc: string;
    seedAbcArtifact: ScoreArtifact | null;
    conversion: Pick<MusicConversionResult, 'inputFormat' | 'outputFormat' | 'normalization' | 'validation' | 'provenance'>;
    warnings: Array<{ id: string; message: string }>;
    errors: Array<{ id: string; message: string }>;
};

async function prepareSeedArtifact(args: {
    seedArtifact: ScoreArtifact;
    validate: boolean;
    deepValidate: boolean;
    persistArtifact: boolean;
    prompt: string;
}) : Promise<PreparedSeed> {
    const converted = await convertMusicNotation({
        inputFormat: args.seedArtifact.format,
        outputFormat: 'abc',
        content: args.seedArtifact.content,
        filename: args.seedArtifact.filename,
        validate: args.validate,
        deepValidate: args.deepValidate,
    });

    const warnings = summarizeFailedWarnings(converted.validation.checks);
    const errors = summarizeFailedErrors(converted.validation.checks);

    let seedAbcArtifact: ScoreArtifact | null = null;
    if (args.persistArtifact) {
        seedAbcArtifact = await createScoreArtifact({
            format: 'abc',
            content: converted.content,
            filename: (args.seedArtifact.filename || 'notagen-seed').replace(/\.(musicxml|xml|mxl)$/i, '.abc'),
            label: 'notagen-seed-abc',
            parentArtifactId: args.seedArtifact.id,
            sourceArtifactId: args.seedArtifact.id,
            validation: converted.validation,
            provenance: converted.provenance,
            metadata: {
                origin: 'api/music/generate',
                role: 'seed',
                prompt: args.prompt.slice(0, 240),
                normalization: converted.normalization,
            },
        });
    }

    return {
        seedArtifact: args.seedArtifact,
        seedAbc: converted.content,
        seedAbcArtifact,
        conversion: {
            inputFormat: converted.inputFormat,
            outputFormat: converted.outputFormat,
            normalization: converted.normalization,
            validation: converted.validation,
            provenance: converted.provenance,
        },
        warnings,
        errors,
    };
}

export async function runMusicGenerateService(
    body: unknown,
    options?: { traceContext?: TraceContext },
): Promise<{ status: number; body: Record<string, unknown> }> {
    try {
        const data = asRecord(body);

        const backendInput = readTrimmedString(data?.backend || 'huggingface') || 'huggingface';
        const backend = normalizeNotaGenBackend(backendInput);
        const requestHfToken = readTrimmedString(data?.hfToken ?? data?.hf_token);
        const modelId = readTrimmedString(data?.modelId ?? data?.model_id) || DEFAULT_NOTAGEN_MODEL_ID;
        const revision = readTrimmedString(data?.revision) || DEFAULT_NOTAGEN_REVISION;
        const userPrompt = readTrimmedString(data?.prompt);
        const spaceId = readTrimmedString(data?.spaceId ?? data?.space_id) || DEFAULT_NOTAGEN_SPACE_ID;
        const spacePeriod = readTrimmedString(data?.period ?? data?.spacePeriod ?? data?.space_period) || DEFAULT_NOTAGEN_SPACE_PERIOD;
        const spaceComposer = readTrimmedString(data?.composer ?? data?.spaceComposer ?? data?.space_composer) || DEFAULT_NOTAGEN_SPACE_COMPOSER;
        const spaceInstrumentation = readTrimmedString(data?.instrumentation ?? data?.spaceInstrumentation ?? data?.space_instrumentation)
            || DEFAULT_NOTAGEN_SPACE_INSTRUMENTATION;
        const inputArtifactId = readTrimmedString(data?.inputArtifactId ?? data?.input_artifact_id ?? data?.seedArtifactId ?? data?.seed_artifact_id);
        const dryRun = readBoolean(data?.dryRun, data?.dry_run, true);
        const validate = readBoolean(data?.validate, undefined, true);
        const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, false);
        const includePrompt = readBoolean(data?.includePrompt, data?.include_prompt, false);
        const includeRawOutput = readBoolean(data?.includeRawOutput, data?.include_raw_output, false);
        const includeAbc = readBoolean(data?.includeAbc, data?.include_abc, false);
        const includeContent = readBoolean(data?.includeContent, data?.include_content, false);
        const timeoutCandidate = readFiniteNumber(data?.timeoutMs ?? data?.timeout_ms);
        const maxNewTokens = Math.max(32, Math.floor(readFiniteNumber(data?.maxNewTokens ?? data?.max_new_tokens) ?? DEFAULT_MAX_NEW_TOKENS));
        const temperature = Math.min(2, Math.max(0, readFiniteNumber(data?.temperature) ?? DEFAULT_TEMPERATURE));
        const topP = Math.min(1, Math.max(0, readFiniteNumber(data?.topP ?? data?.top_p) ?? DEFAULT_TOP_P));
        const promptSeedLimit = Math.max(512, Math.floor(
            readFiniteNumber(data?.promptSeedAbcCharLimit ?? data?.prompt_seed_abc_char_limit)
                ?? DEFAULT_PROMPT_SEED_ABC_CHAR_LIMIT,
        ));
        const outputAbcCharLimit = Math.max(1024, Math.floor(
            readFiniteNumber(data?.outputAbcCharLimit ?? data?.output_abc_char_limit)
                ?? DEFAULT_OUTPUT_ABC_CHAR_LIMIT,
        ));

        if (!backend) {
            return {
                status: 400,
                body: { error: `Unsupported NotaGen backend: ${backendInput || '(empty)'}.` },
            };
        }
        const timeoutMs = Math.max(
            1_000,
            timeoutCandidate ?? (backend === 'huggingface-space' ? DEFAULT_NOTAGEN_SPACE_TIMEOUT_MS : DEFAULT_HF_TIMEOUT_MS),
        );
        if (backend === 'huggingface') {
            if (!requestHfToken) {
                return {
                    status: 400,
                    body: { error: 'Missing hfToken (BYO Hugging Face token).' },
                };
            }
            if (!modelId) {
                return {
                    status: 400,
                    body: { error: 'Missing modelId for NotaGen.' },
                };
            }
        } else {
            if (!spaceId || !spacePeriod || !spaceComposer || !spaceInstrumentation) {
                return {
                    status: 400,
                    body: {
                        error: 'Missing spaceId/period/composer/instrumentation for NotaGen Space backend.',
                    },
                };
            }
            if (inputArtifactId) {
                return {
                    status: 400,
                    body: {
                        error: 'NotaGen Space backend does not support seed artifacts (inputArtifactId) yet.',
                    },
                };
            }
        }

        const hfToken = backend === 'huggingface-space'
            ? (requestHfToken || DEFAULT_NOTAGEN_SPACE_TOKEN)
            : requestHfToken;

        const seedArtifact = inputArtifactId ? await getScoreArtifact(inputArtifactId) : null;
        if (inputArtifactId && !seedArtifact) {
            return {
                status: 404,
                body: { error: 'Seed/input artifact not found.' },
            };
        }

        const preparedSeed = seedArtifact
            ? await prepareSeedArtifact({
                seedArtifact,
                validate,
                deepValidate,
                persistArtifact: !dryRun,
                prompt: userPrompt,
            })
            : null;

        if (preparedSeed?.errors.length) {
            return {
                status: 422,
                body: {
                    error: 'Seed artifact preparation failed validation.',
                    specialist: 'notagen',
                    backend,
                    seedArtifact: summarizeScoreArtifact(preparedSeed.seedArtifact),
                    seedPreparation: preparedSeed.conversion,
                    validationErrors: preparedSeed.errors,
                    validationWarnings: preparedSeed.warnings,
                },
            };
        }

        const promptInfo = backend === 'huggingface'
            ? buildNotaGenPrompt({
                prompt: userPrompt,
                seedAbc: preparedSeed?.seedAbc,
                seedCharLimit: promptSeedLimit,
            })
            : {
                prompt: '',
                seedIncluded: false,
                seedCharsIncluded: 0,
                seedCharsTotal: 0,
                seedTruncatedForPrompt: false,
            };

        const basePayload = {
            ready: true,
            specialist: 'notagen' as const,
            backend,
            request: {
                modelId: backend === 'huggingface' ? modelId : null,
                revision: backend === 'huggingface' ? (revision || null) : null,
                prompt: backend === 'huggingface' ? (userPrompt || null) : null,
                spaceId: backend === 'huggingface-space' ? spaceId : null,
                period: backend === 'huggingface-space' ? spacePeriod : null,
                composer: backend === 'huggingface-space' ? spaceComposer : null,
                instrumentation: backend === 'huggingface-space' ? spaceInstrumentation : null,
                dryRun,
                seedArtifactId: preparedSeed?.seedArtifact.id || null,
                validate,
                deepValidate,
                timeoutMs,
                maxNewTokens,
                temperature,
                topP,
            },
            auth: {
                tokenProvided: Boolean(hfToken),
                tokenPreview: maskToken(hfToken),
            },
            seedArtifact: preparedSeed ? summarizeScoreArtifact(preparedSeed.seedArtifact) : null,
            seedAbcArtifact: preparedSeed?.seedAbcArtifact ? summarizeScoreArtifact(preparedSeed.seedAbcArtifact) : null,
            seedPreparation: preparedSeed?.conversion || null,
            validationPolicy: {
                blockOnError: true,
                seedWarningFailures: preparedSeed?.warnings.length || 0,
                seedErrorFailures: preparedSeed?.errors.length || 0,
            },
            validationWarnings: {
                seed: preparedSeed?.warnings || [],
            },
            generationPrompt: {
                format: backend === 'huggingface' ? 'notagen-generate-abc@1' : 'notagen-space-selection@1',
                seedIncluded: promptInfo.seedIncluded,
                seedCharsTotal: promptInfo.seedCharsTotal,
                seedCharsIncluded: promptInfo.seedCharsIncluded,
                seedTruncatedForPrompt: promptInfo.seedTruncatedForPrompt,
                preview: (includePrompt || dryRun) && backend === 'huggingface'
                    ? promptInfo.prompt.slice(0, 4000)
                    : undefined,
                selection: backend === 'huggingface-space' ? {
                    spaceId,
                    period: spacePeriod,
                    composer: spaceComposer,
                    instrumentation: spaceInstrumentation,
                } : undefined,
            },
        };

        if (dryRun) {
            return {
                status: 200,
                body: {
                    ...basePayload,
                    generation: null,
                    message: backend === 'huggingface'
                        ? 'NotaGen generation request prepared. Set dryRun=false to call Hugging Face inference.'
                        : 'NotaGen Space generation request prepared. Set dryRun=false to call the Hugging Face Space.',
                },
            };
        }

        const backendResult = backend === 'huggingface'
            ? await callHuggingFaceTextGeneration({
                hfToken,
                modelId,
                revision,
                prompt: promptInfo.prompt,
                timeoutMs,
                maxNewTokens,
                temperature,
                topP,
                traceContext: options?.traceContext,
            })
            : await callNotaGenSpaceGeneration({
                spaceId,
                hfToken: hfToken || undefined,
                period: spacePeriod,
                composer: spaceComposer,
                instrumentation: spaceInstrumentation,
                timeoutMs,
                traceContext: options?.traceContext,
            });

        const extracted = backend === 'huggingface'
            ? extractAbcFromGeneratedText(backendResult.generatedText, promptInfo.prompt)
            : { abc: backendResult.generatedText, strategy: 'gradio-final-output' };
        if (!extracted.abc) {
            return {
                status: 422,
                body: {
                    ...basePayload,
                    error: backend === 'huggingface'
                        ? 'Hugging Face output did not contain recognizable ABC notation.'
                        : 'Hugging Face Space output did not contain recognizable ABC notation.',
                    generation: {
                        rawOutputStrategy: extracted.strategy,
                        backendResponse: {
                            provider: backend,
                            endpoint: 'endpoint' in backendResult ? backendResult.endpoint : undefined,
                            httpStatus: backendResult.responseStatus,
                            spaceId: backend === 'huggingface-space' ? spaceId : undefined,
                        },
                        rawOutputPreview: backendResult.generatedText.slice(0, 4000),
                    },
                },
            };
        }

        const backendResponseInfo = {
            provider: backend,
            endpoint: 'endpoint' in backendResult ? backendResult.endpoint : undefined,
            httpStatus: backendResult.responseStatus,
            spaceId: backend === 'huggingface-space' ? spaceId : undefined,
        };

        const rawAbc = truncateText(extracted.abc, outputAbcCharLimit).text;
        const abcResult = await convertMusicNotation({
            inputFormat: 'abc',
            outputFormat: 'abc',
            content: rawAbc,
            validate,
            deepValidate,
        });
        const abcWarnings = summarizeFailedWarnings(abcResult.validation.checks);
        const abcErrors = summarizeFailedErrors(abcResult.validation.checks);
        if (abcErrors.length > 0) {
            return {
                status: 422,
                body: {
                    ...basePayload,
                    error: 'Generated ABC failed validation.',
                    generation: {
                        rawOutputStrategy: extracted.strategy,
                        backendResponse: backendResponseInfo,
                        abcPreparation: {
                            inputFormat: abcResult.inputFormat,
                            outputFormat: abcResult.outputFormat,
                            normalization: abcResult.normalization,
                            validation: abcResult.validation,
                            provenance: abcResult.provenance,
                        },
                        rawOutputPreview: includeRawOutput ? backendResult.generatedText : backendResult.generatedText.slice(0, 1200),
                    },
                    validationErrors: abcErrors,
                    validationWarnings: {
                        ...basePayload.validationWarnings,
                        generatedAbc: abcWarnings,
                    },
                },
            };
        }

        const musicXmlResult = await convertMusicNotation({
            inputFormat: 'abc',
            outputFormat: 'musicxml',
            content: abcResult.content,
            validate,
            deepValidate,
        });
        const musicXmlWarnings = summarizeFailedWarnings(musicXmlResult.validation.checks);
        const musicXmlErrors = summarizeFailedErrors(musicXmlResult.validation.checks);
        if (musicXmlErrors.length > 0) {
            return {
                status: 422,
                body: {
                    ...basePayload,
                    error: 'Generated score conversion to MusicXML failed validation.',
                    generation: {
                        rawOutputStrategy: extracted.strategy,
                        backendResponse: backendResponseInfo,
                        generatedAbc: {
                            normalization: abcResult.normalization,
                            validation: abcResult.validation,
                        },
                        convertedMusicXml: {
                            normalization: musicXmlResult.normalization,
                            validation: musicXmlResult.validation,
                            provenance: musicXmlResult.provenance,
                        },
                    },
                    validationErrors: musicXmlErrors,
                    validationWarnings: {
                        ...basePayload.validationWarnings,
                        generatedAbc: abcWarnings,
                        generatedMusicXml: musicXmlWarnings,
                    },
                },
            };
        }

        const generatedAbcArtifact = await createScoreArtifact({
            format: 'abc',
            content: abcResult.content,
            filename: 'notagen-output.abc',
            label: 'notagen-output-abc',
            parentArtifactId: preparedSeed?.seedArtifact.id,
            sourceArtifactId: preparedSeed?.seedArtifact.id,
            validation: abcResult.validation,
            provenance: abcResult.provenance,
            metadata: {
                origin: 'api/music/generate',
                specialist: 'notagen',
                modelId,
                revision: revision || null,
                prompt: userPrompt || null,
                normalization: abcResult.normalization,
                hf: backend === 'huggingface' ? {
                    endpoint: 'endpoint' in backendResult ? backendResult.endpoint : undefined,
                    status: backendResult.responseStatus,
                    extractionStrategy: extracted.strategy,
                } : undefined,
                gradioSpace: backend === 'huggingface-space' ? {
                    spaceId,
                    period: spacePeriod,
                    composer: spaceComposer,
                    instrumentation: spaceInstrumentation,
                    extractionStrategy: extracted.strategy,
                } : undefined,
            },
        });

        const outputArtifact = await createScoreArtifact({
            format: 'musicxml',
            content: musicXmlResult.content,
            filename: 'notagen-output.musicxml',
            label: 'notagen-output-musicxml',
            parentArtifactId: generatedAbcArtifact.id,
            sourceArtifactId: preparedSeed?.seedArtifact.id || generatedAbcArtifact.id,
            validation: musicXmlResult.validation,
            provenance: musicXmlResult.provenance,
            metadata: {
                origin: 'api/music/generate',
                specialist: 'notagen',
                modelId: backend === 'huggingface' ? modelId : null,
                revision: backend === 'huggingface' ? (revision || null) : null,
                prompt: backend === 'huggingface' ? (userPrompt || null) : null,
                normalization: musicXmlResult.normalization,
                generatedAbcArtifactId: generatedAbcArtifact.id,
                gradioSpace: backend === 'huggingface-space' ? {
                    spaceId,
                    period: spacePeriod,
                    composer: spaceComposer,
                    instrumentation: spaceInstrumentation,
                } : undefined,
            },
        });

        return {
            status: 200,
            body: {
                ...basePayload,
                outputArtifactId: outputArtifact.id,
                generatedAbcArtifactId: generatedAbcArtifact.id,
                outputArtifact: summarizeScoreArtifact(outputArtifact),
                generatedAbcArtifact: summarizeScoreArtifact(generatedAbcArtifact),
                generation: {
                    backendResponse: {
                        ...backendResponseInfo,
                    },
                    rawOutputStrategy: extracted.strategy,
                    generatedAbc: {
                        normalization: abcResult.normalization,
                        validation: abcResult.validation,
                        provenance: abcResult.provenance,
                    },
                    convertedMusicXml: {
                        normalization: musicXmlResult.normalization,
                        validation: musicXmlResult.validation,
                        provenance: musicXmlResult.provenance,
                    },
                    rawOutputPreview: includeRawOutput ? backendResult.generatedText : undefined,
                    backendRaw: includeRawOutput ? backendResult.raw : undefined,
                },
                validationWarnings: {
                    ...basePayload.validationWarnings,
                    generatedAbc: abcWarnings,
                    generatedMusicXml: musicXmlWarnings,
                },
                content: includeContent ? {
                    abc: abcResult.content,
                    musicxml: musicXmlResult.content,
                } : undefined,
                abc: includeAbc ? abcResult.content : undefined,
            },
        };
    } catch (error) {
        return {
            status: 500,
            body: {
                error: error instanceof Error ? error.message : 'Music generate route error.',
            },
        };
    }
}
