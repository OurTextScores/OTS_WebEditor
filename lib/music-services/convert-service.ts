import {
    convertMusicNotation,
    ensureMusicConversionToolsAvailable,
    normalizeMusicFormat,
    runMusicConversionHealthProbe,
} from '../music-conversion';
import {
    createScoreArtifact,
    getScoreArtifact,
    summarizeScoreArtifact,
} from '../score-artifacts';
import {
    asRecord,
    normalizeInputArtifactId,
    readBoolean,
    resolveScoreContent,
} from './common';
import { type TraceContext } from '../trace-http';

const MAX_CONVERT_INPUT_BYTES = Number(process.env.MUSIC_CONVERT_MAX_INPUT_BYTES || (10 * 1024 * 1024));

type ConvertServiceResult = {
    status: number;
    body: Record<string, unknown>;
};

type ConvertServiceOptions = {
    traceContext?: TraceContext;
};

const logConvertEvent = (
    level: 'info' | 'warn' | 'error',
    event: string,
    traceContext: TraceContext | undefined,
    extra?: Record<string, unknown>,
) => {
    const line = JSON.stringify({
        event,
        requestId: traceContext?.requestId || null,
        traceId: traceContext?.traceId || null,
        sessionId: traceContext?.sessionId || null,
        clientSessionId: traceContext?.clientSessionId || null,
        ...(extra || {}),
    });
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.info(line);
};

const readBase64Content = (data: Record<string, unknown> | null) => {
    if (typeof data?.content_base64 === 'string' && data.content_base64.trim()) {
        return data.content_base64.trim();
    }
    if (typeof data?.contentBase64 === 'string' && data.contentBase64.trim()) {
        return data.contentBase64.trim();
    }
    return '';
};

const inferTextFormat = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }
    if (/(^|\n)K:\s*\S+/m.test(trimmed) || /(^|\n)X:\s*\d+/m.test(trimmed)) {
        return 'abc' as const;
    }
    if (/<score-partwise\b|<score-timewise\b|^\s*<\?xml\b/.test(trimmed)) {
        return 'musicxml' as const;
    }
    return null;
};

const inferBase64Format = (contentBase64: string) => {
    const compact = contentBase64.replace(/\s+/g, '');
    if (!compact) {
        return null;
    }
    try {
        const bytes = Buffer.from(compact, 'base64');
        if (bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'MThd') {
            return 'midi' as const;
        }
    } catch {
        // ignore
    }
    return null;
};

const checkInputSize = (args: {
    content: string;
    encoding: 'utf8' | 'base64';
}): string | null => {
    if (args.encoding === 'base64') {
        try {
            const compact = args.content.replace(/\s+/g, '');
            const bytes = Buffer.from(compact, 'base64');
            const reencoded = bytes.toString('base64').replace(/=+$/, '');
            if (reencoded !== compact.replace(/=+$/, '')) {
                return 'Base64 input could not be decoded.';
            }
            if (bytes.length > MAX_CONVERT_INPUT_BYTES) {
                return `Input exceeds size limit (${bytes.length} bytes > ${MAX_CONVERT_INPUT_BYTES}).`;
            }
        } catch {
            return 'Base64 input could not be decoded.';
        }
        return null;
    }

    const sizeBytes = Buffer.byteLength(args.content, 'utf8');
    if (sizeBytes > MAX_CONVERT_INPUT_BYTES) {
        return `Input exceeds size limit (${sizeBytes} bytes > ${MAX_CONVERT_INPUT_BYTES}).`;
    }
    return null;
};

export async function runMusicConvertService(body: unknown, options?: ConvertServiceOptions): Promise<ConvertServiceResult> {
    const traceContext = options?.traceContext;
    const data = asRecord(body);

    const healthCheck = readBoolean(data?.healthCheck, data?.health_check, false);
    if (healthCheck) {
        const tools = await ensureMusicConversionToolsAvailable();
        const probe = tools.ok
            ? await runMusicConversionHealthProbe({ traceContext })
            : {
                ok: false,
                inputFormat: 'musicxml' as const,
                outputFormat: 'midi' as const,
                timeoutMs: tools.config.musescoreTimeoutMs,
                durationMs: 0,
                error: 'Skipped because conversion tools are unavailable.',
            };
        logConvertEvent('info', 'music.convert.health_probe', traceContext, {
            ok: tools.ok,
            missingCount: tools.missing.length,
            musescoreCandidates: tools.config.musescoreBins,
            pythonCommand: tools.config.pythonCommand,
            probeOk: probe.ok,
            probeDurationMs: probe.durationMs,
            probeError: probe.error || null,
        });
        return {
            status: tools.ok && probe.ok ? 200 : 503,
            body: {
                ok: tools.ok && probe.ok,
                engine: 'notagen',
                scripts: {
                    xml2abc: tools.config.xml2abcScript,
                    abc2xml: tools.config.abc2xmlScript,
                },
                midi: {
                    engine: 'musescore',
                    candidates: tools.config.musescoreBins,
                },
                pythonCommand: tools.config.pythonCommand,
                missing: tools.missing,
                probe,
                maxInputBytes: MAX_CONVERT_INPUT_BYTES,
                timeouts: {
                    defaultMs: tools.config.defaultTimeoutMs,
                    musescoreMs: tools.config.musescoreTimeoutMs,
                },
            },
        };
    }

    const inputFormatHint = normalizeMusicFormat(data?.input_format ?? data?.inputFormat);
    const outputFormat = normalizeMusicFormat(data?.output_format ?? data?.outputFormat);
    if (!outputFormat) {
        return {
            status: 400,
            body: { error: 'Missing or invalid output format. Use abc, musicxml, or midi.' },
        };
    }

    const inputArtifactId = normalizeInputArtifactId(data);
    const filename = typeof data?.filename === 'string' ? data.filename : undefined;
    const validate = readBoolean(data?.validate, undefined, true);
    const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, true);
    const includeContent = readBoolean(data?.includeContent, data?.include_content, false);
    const timeoutMsRaw = Number(data?.timeoutMs ?? data?.timeout_ms);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : undefined;
    const startedAt = Date.now();
    let session: { scoreSessionId?: string; revision?: number } | null = null;

    // Resolve input source in priority order:
    // 1) explicit artifact id
    // 2) direct base64 payload (for MIDI)
    // 3) score session/direct text via shared resolver
    let inputArtifact = null as Awaited<ReturnType<typeof getScoreArtifact>> | null;
    let inputContent = '';
    let inputEncoding: 'utf8' | 'base64' = 'utf8';
    let inferredFormat: ReturnType<typeof normalizeMusicFormat> = null;

    if (inputArtifactId) {
        inputArtifact = await getScoreArtifact(inputArtifactId);
        if (!inputArtifact) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: {
                        code: 'target_not_found',
                        message: 'Input artifact not found.',
                        artifactId: inputArtifactId,
                    },
                },
            };
        }
        inputContent = inputArtifact.content;
        inputEncoding = inputArtifact.encoding === 'base64' ? 'base64' : 'utf8';
        inferredFormat = inputArtifact.format;
    } else {
        const base64Content = readBase64Content(data);
        if (base64Content) {
            if (inputFormatHint && inputFormatHint !== 'midi') {
                return {
                    status: 400,
                    body: { error: 'Base64 input is currently supported for MIDI only. Set inputFormat to midi.' },
                };
            }
            const inferredBase64Format = inferBase64Format(base64Content);
            if (!inputFormatHint && !inferredBase64Format) {
                return {
                    status: 400,
                    body: { error: 'Could not infer format from base64 payload. Provide inputFormat (midi).' },
                };
            }
            inputContent = base64Content;
            inputEncoding = 'base64';
            inferredFormat = inferredBase64Format;
        } else {
            const resolution = await resolveScoreContent(body);
            if (resolution.error) {
                return resolution.error as ConvertServiceResult;
            }
            inputContent = resolution.xml;
            inputArtifact = resolution.artifact;
            session = resolution.session;
            inferredFormat = inputArtifact?.format ?? inferTextFormat(inputContent);
        }
    }

    const inputSizeError = checkInputSize({ content: inputContent, encoding: inputEncoding });
    if (inputSizeError) {
        return {
            status: 400,
            body: { error: inputSizeError },
        };
    }

    // Direct resolution artifact or session context
    const inputFormat = inputFormatHint ?? inferredFormat ?? 'musicxml';

    if (!inputArtifact) {
        inputArtifact = await createScoreArtifact({
            format: inputFormat,
            content: inputContent,
            encoding: inputEncoding,
            mimeType: inputFormat === 'midi' ? 'audio/midi' : 'text/plain; charset=utf-8',
            filename,
            label: 'conversion-input',
            metadata: {
                origin: 'api/music/convert',
            },
        });
    }

    logConvertEvent('info', 'music.convert.request', traceContext, {
        inputFormat,
        outputFormat,
        inputEncoding,
        validate,
        deepValidate,
        timeoutMs: timeoutMs ?? null,
        inputArtifactId: inputArtifact.id,
    });

    const result = await convertMusicNotation({
        inputFormat,
        outputFormat,
        content: inputContent,
        contentEncoding: inputEncoding,
        filename,
        validate,
        deepValidate,
        timeoutMs,
        traceContext,
    });

    logConvertEvent('info', 'music.convert.result', traceContext, {
        inputFormat: result.inputFormat,
        outputFormat: result.outputFormat,
        contentEncoding: result.contentEncoding,
        validationWarningCount: result.validation.summary.warning,
        validationErrorCount: result.validation.summary.error,
        durationMs: Date.now() - startedAt,
        engineDurationMs: result.provenance.durationMs,
    });

    const outputArtifact = await createScoreArtifact({
        format: result.outputFormat,
        content: result.content,
        encoding: result.contentEncoding,
        mimeType: result.outputFormat === 'midi' ? 'audio/midi' : 'text/plain; charset=utf-8',
        filename,
        label: 'conversion-output',
        parentArtifactId: inputArtifact.id,
        sourceArtifactId: inputArtifact.id,
        validation: result.validation,
        provenance: result.provenance,
        metadata: {
            origin: 'api/music/convert',
            inputFormat: result.inputFormat,
            outputFormat: result.outputFormat,
            normalization: result.normalization,
        },
    });

    return {
        status: 200,
        body: {
            scoreSessionId: session?.scoreSessionId ?? null,
            revision: session?.revision ?? null,
            inputArtifactId: inputArtifact.id,
            outputArtifactId: outputArtifact.id,
            inputArtifact: summarizeScoreArtifact(inputArtifact),
            outputArtifact: summarizeScoreArtifact(outputArtifact),
            conversion: {
                inputFormat: result.inputFormat,
                outputFormat: result.outputFormat,
                contentEncoding: result.contentEncoding,
                normalization: result.normalization,
                validation: result.validation,
                provenance: result.provenance,
            },
            content: includeContent ? result.content : undefined,
            contentEncoding: includeContent ? result.contentEncoding : undefined,
        },
    };
}
