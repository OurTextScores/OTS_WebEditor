import { NextResponse } from 'next/server';
import {
    convertMusicNotation,
    type MusicConversionResult,
    type ValidationCheck,
} from '../../../../lib/music-conversion';
import {
    createScoreArtifact,
    getScoreArtifact,
    summarizeScoreArtifact,
    type ScoreArtifact,
} from '../../../../lib/score-artifacts';

export const runtime = 'nodejs';

const DEFAULT_CHATMUSICIAN_MODEL_ID = (process.env.MUSIC_CHATMUSICIAN_DEFAULT_MODEL_ID || '').trim();
const DEFAULT_CHATMUSICIAN_REVISION = (process.env.MUSIC_CHATMUSICIAN_DEFAULT_REVISION || '').trim();
const DEFAULT_HF_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_NEW_TOKENS = 384;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_PROMPT_ABC_CHAR_LIMIT = 12_000;

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
        text: `${value.slice(0, maxChars)}\n% ...truncated for prompt...`,
        truncated: true,
    };
};

function buildChatMusicianPrompt(args: {
    question: string;
    abcContent: string;
    abcCharLimit: number;
}) {
    const abcSnippet = truncateText(args.abcContent, args.abcCharLimit);
    const instruction = [
        'Analyze the following ABC notation score and answer the user question.',
        'Use music-theory language when helpful and cite concrete evidence from the score.',
        'If the score is incomplete or ambiguous, say what is uncertain.',
        '',
        `Question: ${args.question}`,
        '',
        'ABC Score:',
        abcSnippet.text,
        '',
        'Respond with a concise but specific analysis.',
    ].join('\n');

    return {
        prompt: `Human: ${instruction} </s> Assistant: `,
        abcCharsTotal: args.abcContent.length,
        abcCharsIncluded: abcSnippet.text.length,
        abcTruncatedForPrompt: abcSnippet.truncated,
    };
}

function getChatMusicianInferenceUrl(modelId: string, revision: string) {
    const base = `https://api-inference.huggingface.co/models/${encodeURIComponent(modelId)}`;
    return revision ? `${base}?revision=${encodeURIComponent(revision)}` : base;
}

function parseHfGeneratedText(data: unknown, prompt: string): string {
    const stripPromptEcho = (text: string) => {
        if (text.startsWith(prompt)) {
            return text.slice(prompt.length).trim();
        }
        return text.trim();
    };

    if (typeof data === 'string') {
        return stripPromptEcho(data);
    }

    if (Array.isArray(data)) {
        for (const item of data) {
            const record = asRecord(item);
            const generatedText = record && typeof record.generated_text === 'string'
                ? record.generated_text
                : (record && typeof record.text === 'string' ? record.text : '');
            if (generatedText) {
                return stripPromptEcho(generatedText);
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
    if (typeof record.answer === 'string') {
        return stripPromptEcho(record.answer);
    }
    return '';
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

async function callHuggingFaceTextGeneration(args: {
    hfToken: string;
    modelId: string;
    revision: string;
    prompt: string;
    timeoutMs: number;
    maxNewTokens: number;
    temperature: number;
    topP: number;
}) {
    const endpoint = getChatMusicianInferenceUrl(args.modelId, args.revision);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
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

type PreparedAnalysisInput = {
    abcContent: string;
    conversion: Pick<MusicConversionResult, 'inputFormat' | 'outputFormat' | 'normalization' | 'validation' | 'provenance'>;
    inputWarnings: Array<{ id: string; message: string }>;
    inputErrors: Array<{ id: string; message: string }>;
    analysisInputArtifact: ScoreArtifact | null;
};

async function prepareAnalysisInput(args: {
    inputArtifact: ScoreArtifact;
    filename?: string;
    validate: boolean;
    deepValidate: boolean;
    persistArtifact: boolean;
    question: string;
}) : Promise<PreparedAnalysisInput> {
    const converted = await convertMusicNotation({
        inputFormat: args.inputArtifact.format,
        outputFormat: 'abc',
        content: args.inputArtifact.content,
        filename: args.filename || args.inputArtifact.filename,
        validate: args.validate,
        deepValidate: args.deepValidate,
    });

    const inputWarnings = summarizeFailedWarnings(converted.validation.checks);
    const inputErrors = summarizeFailedErrors(converted.validation.checks);

    let analysisInputArtifact: ScoreArtifact | null = null;
    if (args.persistArtifact) {
        analysisInputArtifact = await createScoreArtifact({
            format: 'abc',
            content: converted.content,
            filename: (args.filename || args.inputArtifact.filename || 'analysis-input').replace(/\.(musicxml|xml|mxl)$/i, '.abc'),
            label: 'chatmusician-analysis-input',
            parentArtifactId: args.inputArtifact.id,
            sourceArtifactId: args.inputArtifact.id,
            validation: converted.validation,
            provenance: converted.provenance,
            metadata: {
                origin: 'api/music/analyze',
                question: args.question.slice(0, 240),
                normalization: converted.normalization,
            },
        });
    }

    return {
        abcContent: converted.content,
        conversion: {
            inputFormat: converted.inputFormat,
            outputFormat: converted.outputFormat,
            normalization: converted.normalization,
            validation: converted.validation,
            provenance: converted.provenance,
        },
        inputWarnings,
        inputErrors,
        analysisInputArtifact,
    };
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = asRecord(body);

        const backend = readTrimmedString(data?.backend || 'huggingface') || 'huggingface';
        const hfToken = readTrimmedString(data?.hfToken ?? data?.hf_token);
        const modelId = readTrimmedString(data?.modelId ?? data?.model_id) || DEFAULT_CHATMUSICIAN_MODEL_ID;
        const revision = readTrimmedString(data?.revision) || DEFAULT_CHATMUSICIAN_REVISION;
        const question = readTrimmedString(data?.question ?? data?.prompt);
        const inputArtifactId = readTrimmedString(data?.inputArtifactId ?? data?.input_artifact_id ?? data?.artifactId ?? data?.artifact_id);
        const dryRun = readBoolean(data?.dryRun, data?.dry_run, true);
        const validate = readBoolean(data?.validate, undefined, true);
        const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, false);
        const includePrompt = readBoolean(data?.includePrompt, data?.include_prompt, false);
        const includeAbc = readBoolean(data?.includeAbc, data?.include_abc, false);
        const timeoutMs = Math.max(1_000, readFiniteNumber(data?.timeoutMs ?? data?.timeout_ms) ?? DEFAULT_HF_TIMEOUT_MS);
        const maxNewTokens = Math.max(32, Math.floor(readFiniteNumber(data?.maxNewTokens ?? data?.max_new_tokens) ?? DEFAULT_MAX_NEW_TOKENS));
        const temperature = Math.min(2, Math.max(0, readFiniteNumber(data?.temperature) ?? DEFAULT_TEMPERATURE));
        const topP = Math.min(1, Math.max(0, readFiniteNumber(data?.topP ?? data?.top_p) ?? DEFAULT_TOP_P));
        const promptAbcCharLimitEnv = readFiniteNumber(process.env.MUSIC_CHATMUSICIAN_PROMPT_ABC_CHAR_LIMIT);
        const promptAbcCharLimitRequested = readFiniteNumber(data?.promptAbcCharLimit ?? data?.prompt_abc_char_limit);
        const promptAbcCharLimit = Math.max(512, Math.floor(
            promptAbcCharLimitRequested
                ?? promptAbcCharLimitEnv
                ?? DEFAULT_PROMPT_ABC_CHAR_LIMIT,
        ));

        if (backend !== 'huggingface') {
            return NextResponse.json({ error: 'Only huggingface backend is supported right now.' }, { status: 400 });
        }
        if (!hfToken) {
            return NextResponse.json({ error: 'Missing hfToken (BYO Hugging Face token).' }, { status: 400 });
        }
        if (!modelId) {
            return NextResponse.json({ error: 'Missing modelId for ChatMusician.' }, { status: 400 });
        }
        if (!inputArtifactId) {
            return NextResponse.json({ error: 'Missing inputArtifactId (score artifact to analyze).' }, { status: 400 });
        }
        if (!question) {
            return NextResponse.json({ error: 'Missing question (or prompt).' }, { status: 400 });
        }

        const inputArtifact = await getScoreArtifact(inputArtifactId);
        if (!inputArtifact) {
            return NextResponse.json({ error: 'Input artifact not found.' }, { status: 404 });
        }

        const prepared = await prepareAnalysisInput({
            inputArtifact,
            validate,
            deepValidate,
            persistArtifact: !dryRun,
            question,
        });

        if (prepared.inputErrors.length > 0) {
            return NextResponse.json({
                error: 'Analysis input preparation failed validation.',
                specialist: 'chatmusician',
                backend: 'huggingface',
                inputArtifact: summarizeScoreArtifact(inputArtifact),
                analysisInputPreparation: prepared.conversion,
                validationErrors: prepared.inputErrors,
                validationWarnings: prepared.inputWarnings,
            }, { status: 422 });
        }

        const promptInfo = buildChatMusicianPrompt({
            question,
            abcContent: prepared.abcContent,
            abcCharLimit: promptAbcCharLimit,
        });

        const basePayload = {
            ready: true,
            specialist: 'chatmusician' as const,
            backend: 'huggingface' as const,
            request: {
                modelId,
                revision: revision || null,
                question,
                dryRun,
                inputArtifactId: inputArtifact.id,
                validate,
                deepValidate,
                timeoutMs,
                maxNewTokens,
                temperature,
                topP,
            },
            auth: {
                tokenProvided: true,
                tokenPreview: maskToken(hfToken),
            },
            inputArtifact: summarizeScoreArtifact(inputArtifact),
            analysisInputArtifact: prepared.analysisInputArtifact ? summarizeScoreArtifact(prepared.analysisInputArtifact) : null,
            analysisInputPreparation: prepared.conversion,
            validationPolicy: {
                blockOnError: true,
                warningFailures: prepared.inputWarnings.length,
                errorFailures: prepared.inputErrors.length,
            },
            validationWarnings: prepared.inputWarnings,
            prompt: {
                format: 'chatmusician-human-assistant@1',
                abcCharsTotal: promptInfo.abcCharsTotal,
                abcCharsIncluded: promptInfo.abcCharsIncluded,
                abcTruncatedForPrompt: promptInfo.abcTruncatedForPrompt,
                preview: includePrompt || dryRun ? promptInfo.prompt.slice(0, 4000) : undefined,
            },
            inputAbc: includeAbc ? prepared.abcContent : undefined,
        };

        if (dryRun) {
            return NextResponse.json({
                ...basePayload,
                analysis: null,
                message: 'ChatMusician analysis request prepared. Set dryRun=false to call Hugging Face inference.',
            });
        }

        const hfResult = await callHuggingFaceTextGeneration({
            hfToken,
            modelId,
            revision,
            prompt: promptInfo.prompt,
            timeoutMs,
            maxNewTokens,
            temperature,
            topP,
        });

        return NextResponse.json({
            ...basePayload,
            analysis: {
                text: hfResult.generatedText,
                backendResponse: {
                    provider: 'huggingface',
                    endpoint: hfResult.endpoint,
                    httpStatus: hfResult.responseStatus,
                },
            },
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Music analyze route error.',
        }, { status: 500 });
    }
}
