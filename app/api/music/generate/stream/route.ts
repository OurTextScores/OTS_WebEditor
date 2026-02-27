import {
    convertMusicNotation,
    type ValidationCheck,
} from '../../../../../lib/music-conversion';
import {
    createScoreArtifact,
    summarizeScoreArtifact,
} from '../../../../../lib/score-artifacts';

export const runtime = 'nodejs';

const DEFAULT_NOTAGEN_SPACE_ID = (process.env.MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen').trim();
const DEFAULT_NOTAGEN_SPACE_TOKEN = (process.env.MUSIC_NOTAGEN_SPACE_TOKEN || '').trim();
const DEFAULT_TIMEOUT_MS = 300_000;

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
const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

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

function extractGradioChoices(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((entry) => {
        if (Array.isArray(entry) && typeof entry[0] === 'string') {
            return entry[0];
        }
        if (typeof entry === 'string') {
            return entry;
        }
        return '';
    }).filter(Boolean);
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

function extractSpaceAbcFromGradioData(data: unknown): { abc: string | null; processOutput?: string } {
    if (!Array.isArray(data)) {
        return { abc: null };
    }
    const arr = data as unknown[];
    const processOutput = typeof arr[0] === 'string' ? arr[0] : undefined;
    const abcCandidate = typeof arr[1] === 'string' ? arr[1].trim() : '';
    if (!abcCandidate || abcCandidate === 'Converting files...' || /^Error converting files:/i.test(abcCandidate)) {
        return { abc: null, processOutput };
    }
    return { abc: abcCandidate, processOutput };
}

function extractFallbackAbcFromProcessOutput(processOutput: string): string | null {
    const candidate = processOutput.trim();
    if (!candidate) {
        return null;
    }
    // NotaGen process output is the ABC text stream itself. Use a conservative
    // shape check and let downstream validation reject incomplete outputs.
    const hasKey = /(?:^|\n)K:[^\n]+/.test(candidate);
    const hasMeter = /(?:^|\n)M:[^\n]+/.test(candidate);
    const hasVoice = /(?:^|\n)V:\d+/.test(candidate);
    const hasMusicBars = /\|/.test(candidate);
    if (!hasKey || !hasMeter || !hasVoice || !hasMusicBars) {
        return null;
    }
    return candidate;
}

function sseFrame(event: string, payload: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
    const encoder = new TextEncoder();

    let body: Record<string, unknown> | null = null;
    try {
        body = asRecord(await request.json());
    } catch {
        body = {};
    }

    const spaceId = readTrimmedString(body?.spaceId ?? body?.space_id) || DEFAULT_NOTAGEN_SPACE_ID;
    const period = readTrimmedString(body?.period ?? body?.spacePeriod ?? body?.space_period);
    const composer = readTrimmedString(body?.composer ?? body?.spaceComposer ?? body?.space_composer);
    const instrumentation = readTrimmedString(body?.instrumentation ?? body?.spaceInstrumentation ?? body?.space_instrumentation);
    const requestToken = readTrimmedString(body?.hfToken ?? body?.hf_token);
    const hfToken = requestToken || DEFAULT_NOTAGEN_SPACE_TOKEN;
    const timeoutMs = Math.max(1_000, readFiniteNumber(body?.timeoutMs ?? body?.timeout_ms) ?? DEFAULT_TIMEOUT_MS);
    const validate = readBoolean(body?.validate, undefined, true);
    const deepValidate = readBoolean(body?.deepValidate, body?.deep_validate, false);
    const includeContent = readBoolean(body?.includeContent, body?.include_content, true);
    const includeAbc = readBoolean(body?.includeAbc, body?.include_abc, true);
    const includeRawOutput = readBoolean(body?.includeRawOutput, body?.include_raw_output, false);

    if (!period || !composer || !instrumentation) {
        return new Response(JSON.stringify({ error: 'Missing period/composer/instrumentation.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const write = (event: string, payload: unknown) => controller.enqueue(encoder.encode(sseFrame(event, payload)));
            const close = () => {
                try {
                    controller.close();
                } catch {}
            };
            const fail = (message: string, details?: unknown) => {
                write('error', { error: message, details });
                close();
            };

            write('ready', {
                specialist: 'notagen',
                backend: 'huggingface-space',
                request: { spaceId, period, composer, instrumentation, timeoutMs, validate, deepValidate },
            });

            let app: {
                close?: () => void;
                predict: (endpoint: string, data: unknown[]) => Promise<{ data: unknown }>;
                submit: (endpoint: string, data: unknown[]) => {
                    cancel: () => Promise<void>;
                    next: () => Promise<IteratorResult<unknown>>;
                };
            } | null = null;
            let job: {
                cancel: () => Promise<void>;
                next: () => Promise<IteratorResult<unknown>>;
            } | null = null;
            let finalAbc = '';
            let lastProcessOutput = '';
            let lastRawData: unknown = null;
            let terminalStatusError: { message: string; details?: unknown } | null = null;
            let lastStatusSignature = '';
            let lastEmittedProcessOutput = '';
            let lastEmittedAbc = '';
            let lastProgressEmitAt = 0;

            try {
                const { Client } = await import('@gradio/client');
                app = await Client.connect(spaceId, {
                    events: ['data', 'status', 'log'],
                    ...(hfToken ? { token: hfToken as `hf_${string}` } : {}),
                });

                const updatePeriod = await app.predict('/update_components', [period, null]);
                const periodChoices = parseSpaceUpdateChoices(updatePeriod?.data);
                if (periodChoices.composers.length > 0 && !periodChoices.composers.includes(composer)) {
                    fail(`Composer "${composer}" is not valid for period "${period}" in Space ${spaceId}.`, {
                        period,
                        composer,
                        validComposers: periodChoices.composers,
                    });
                    return;
                }

                const updateComposer = await app.predict('/update_components_1', [period, composer]);
                const composerChoices = parseSpaceUpdateChoices(updateComposer?.data);
                if (composerChoices.instrumentations.length > 0 && !composerChoices.instrumentations.includes(instrumentation)) {
                    fail(`Instrumentation "${instrumentation}" is not valid for ${period} / ${composer} in Space ${spaceId}.`, {
                        period,
                        composer,
                        instrumentation,
                        validInstrumentations: composerChoices.instrumentations,
                    });
                    return;
                }

                job = app.submit('/generate_music', [period, composer, instrumentation]);
                const startedAt = Date.now();

                while (true) {
                    const remainingMs = timeoutMs - (Date.now() - startedAt);
                    if (remainingMs <= 0) {
                        try { await job?.cancel(); } catch {}
                        fail(`Hugging Face Space generation timed out after ${timeoutMs}ms.`);
                        return;
                    }

                    const nextResult = await Promise.race([
                        job.next(),
                        new Promise<never>((_, reject) => {
                            const t = setTimeout(() => {
                                clearTimeout(t);
                                reject(new Error(`Hugging Face Space generation timed out after ${timeoutMs}ms.`));
                            }, Math.max(1, remainingMs));
                        }),
                    ]);

                    if (nextResult.done) {
                        break;
                    }

                    const eventRecord = asRecord(nextResult.value);
                    const eventType = typeof eventRecord?.type === 'string' ? eventRecord.type : '';

                    if (eventType === 'status') {
                        const stage = typeof eventRecord?.stage === 'string' ? eventRecord.stage : undefined;
                        const success = typeof eventRecord?.success === 'boolean' ? eventRecord.success : undefined;
                        const message = eventRecord?.message;
                        const statusSignature = JSON.stringify({ stage, success, message });
                        if (statusSignature !== lastStatusSignature) {
                            lastStatusSignature = statusSignature;
                            write('status', { stage, success, message });
                        }
                        if (stage === 'error' || success === false) {
                            terminalStatusError = {
                                message: typeof message === 'string' ? message : 'Hugging Face Space generation failed.',
                                details: eventRecord,
                            };
                            // Some Gradio/Spaces runs emit a terminal "GPU task aborted" status
                            // after already streaming the final ABC. If we already have output,
                            // continue to post-process instead of failing the whole request.
                            if (finalAbc) {
                                break;
                            }
                            continue;
                        }
                        continue;
                    }

                    if (eventType === 'log') {
                        write('log', {
                            level: eventRecord?.level,
                            title: eventRecord?.title,
                            message: eventRecord?.log,
                        });
                        continue;
                    }

                    if (eventType !== 'data') {
                        continue;
                    }

                    lastRawData = eventRecord?.data;
                    const extracted = extractSpaceAbcFromGradioData(eventRecord?.data);
                    if (typeof extracted.processOutput === 'string') {
                        lastProcessOutput = extracted.processOutput;
                    }
                    if (extracted.abc) {
                        finalAbc = extracted.abc;
                    }

                    const now = Date.now();
                    const progressChanged = lastProcessOutput !== lastEmittedProcessOutput || finalAbc !== lastEmittedAbc;
                    const shouldEmitProgress = progressChanged && (
                        !!finalAbc ||
                        now - lastProgressEmitAt >= 200
                    );
                    if (shouldEmitProgress) {
                        lastProgressEmitAt = now;
                        lastEmittedProcessOutput = lastProcessOutput;
                        lastEmittedAbc = finalAbc;
                        write('progress', {
                            processOutput: lastProcessOutput,
                            abc: finalAbc || undefined,
                        });
                    }

                    if (finalAbc) {
                        try { await job?.cancel(); } catch {}
                        break;
                    }
                }

                if (!finalAbc) {
                    if (terminalStatusError && /gpu task aborted/i.test(terminalStatusError.message) && lastProcessOutput) {
                        const fallbackAbc = extractFallbackAbcFromProcessOutput(lastProcessOutput);
                        if (fallbackAbc) {
                            finalAbc = fallbackAbc;
                            write('status', {
                                stage: 'postprocess',
                                message: 'Using streamed NotaGen ABC after terminal GPU abort status.',
                            });
                        }
                    }
                }

                if (!finalAbc) {
                    if (terminalStatusError) {
                        fail(terminalStatusError.message, terminalStatusError.details);
                        return;
                    }
                    fail('NotaGen Space did not return final ABC output.', { lastRawData });
                    return;
                }

                write('status', { stage: 'postprocess', message: 'Validating and converting generated ABC...' });

                const abcResult = await convertMusicNotation({
                    inputFormat: 'abc',
                    outputFormat: 'abc',
                    content: finalAbc,
                    validate,
                    deepValidate,
                });
                const abcWarnings = summarizeFailedWarnings(abcResult.validation.checks);
                const abcErrors = summarizeFailedErrors(abcResult.validation.checks);
                if (abcErrors.length > 0) {
                    fail('Generated ABC failed validation.', {
                        validationErrors: abcErrors,
                        validationWarnings: abcWarnings,
                        generatedAbc: includeAbc ? abcResult.content : undefined,
                    });
                    return;
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
                    fail('Generated score conversion to MusicXML failed validation.', {
                        validationErrors: musicXmlErrors,
                        validationWarnings: {
                            generatedAbc: abcWarnings,
                            generatedMusicXml: musicXmlWarnings,
                        },
                    });
                    return;
                }

                const generatedAbcArtifact = await createScoreArtifact({
                    format: 'abc',
                    content: abcResult.content,
                    filename: 'notagen-output.abc',
                    label: 'notagen-output-abc',
                    validation: abcResult.validation,
                    provenance: abcResult.provenance,
                    metadata: {
                        origin: 'api/music/generate/stream',
                        specialist: 'notagen',
                        gradioSpace: { spaceId, period, composer, instrumentation },
                        normalization: abcResult.normalization,
                    },
                });

                const outputArtifact = await createScoreArtifact({
                    format: 'musicxml',
                    content: musicXmlResult.content,
                    filename: 'notagen-output.musicxml',
                    label: 'notagen-output-musicxml',
                    parentArtifactId: generatedAbcArtifact.id,
                    sourceArtifactId: generatedAbcArtifact.id,
                    validation: musicXmlResult.validation,
                    provenance: musicXmlResult.provenance,
                    metadata: {
                        origin: 'api/music/generate/stream',
                        specialist: 'notagen',
                        gradioSpace: { spaceId, period, composer, instrumentation },
                        normalization: musicXmlResult.normalization,
                        generatedAbcArtifactId: generatedAbcArtifact.id,
                    },
                });

                write('result', {
                    specialist: 'notagen',
                    backend: 'huggingface-space',
                    outputArtifactId: outputArtifact.id,
                    generatedAbcArtifactId: generatedAbcArtifact.id,
                    outputArtifact: summarizeScoreArtifact(outputArtifact),
                    generatedAbcArtifact: summarizeScoreArtifact(generatedAbcArtifact),
                    validationWarnings: {
                        generatedAbc: abcWarnings,
                        generatedMusicXml: musicXmlWarnings,
                    },
                    generation: {
                        backendResponse: { provider: 'huggingface-space', spaceId, httpStatus: 200 },
                        rawOutputStrategy: 'gradio-final-output',
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
                        rawOutputPreview: includeRawOutput ? finalAbc : undefined,
                    },
                    abc: includeAbc ? abcResult.content : undefined,
                    content: includeContent ? { abc: abcResult.content, musicxml: musicXmlResult.content } : undefined,
                });
                write('done', { ok: true });
                close();
            } catch (error) {
                try {
                    if (job) {
                        await job.cancel().catch(() => undefined);
                    }
                } catch {}
                fail(error instanceof Error ? error.message : 'NotaGen Space stream failed.');
            } finally {
                try {
                    app?.close?.();
                } catch {}
            }
        },
        cancel() {
            // no-op; resource cleanup handled in try/finally
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
