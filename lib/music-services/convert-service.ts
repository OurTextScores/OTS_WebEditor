import {
    convertMusicNotation,
    ensureMusicConversionToolsAvailable,
    normalizeMusicFormat,
} from '../music-conversion';
import {
    createScoreArtifact,
    getScoreArtifact,
    summarizeScoreArtifact,
    type ScoreArtifact,
} from '../score-artifacts';
import { MusicServiceError } from './errors';

type ConvertRequestPayload = {
    status: number;
    body: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

function readBoolean(camel: unknown, snake: unknown, fallback: boolean) {
    if (typeof camel === 'boolean') {
        return camel;
    }
    if (typeof snake === 'boolean') {
        return snake;
    }
    return fallback;
}

export async function runMusicConvertService(body: unknown): Promise<ConvertRequestPayload> {
    const data = asRecord(body);

    const healthCheck = readBoolean(data?.healthCheck, data?.health_check, false);
    if (healthCheck) {
        const tools = await ensureMusicConversionToolsAvailable();
        return {
            status: tools.ok ? 200 : 503,
            body: {
                ok: tools.ok,
                engine: 'notagen',
                scripts: {
                    xml2abc: tools.config.xml2abcScript,
                    abc2xml: tools.config.abc2xmlScript,
                },
                pythonCommand: tools.config.pythonCommand,
                missing: tools.missing,
            },
        };
    }

    const inputFormat = normalizeMusicFormat(data?.input_format ?? data?.inputFormat);
    const outputFormat = normalizeMusicFormat(data?.output_format ?? data?.outputFormat);
    const contentInput = typeof data?.content === 'string'
        ? data.content
        : (typeof data?.text === 'string' ? data.text : '');
    const inputArtifactId = typeof data?.input_artifact_id === 'string'
        ? data.input_artifact_id.trim()
        : (typeof data?.inputArtifactId === 'string' ? data.inputArtifactId.trim() : '');
    const filename = typeof data?.filename === 'string' ? data.filename : undefined;
    const validate = readBoolean(data?.validate, undefined, true);
    const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, true);
    const includeContent = readBoolean(data?.includeContent, data?.include_content, false);
    const timeoutMsRaw = Number(data?.timeoutMs ?? data?.timeout_ms);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : undefined;

    if (!outputFormat) {
        throw new MusicServiceError('Missing or invalid output format. Use abc or musicxml.', 400);
    }

    let effectiveInputFormat = inputFormat;
    let effectiveContent = contentInput;
    let sourceArtifact: ScoreArtifact | null = null;

    if (inputArtifactId) {
        sourceArtifact = await getScoreArtifact(inputArtifactId);
        if (!sourceArtifact) {
            throw new MusicServiceError('Input artifact not found.', 404);
        }
        effectiveInputFormat = sourceArtifact.format;
        effectiveContent = sourceArtifact.content;
    }

    if (!effectiveInputFormat) {
        throw new MusicServiceError(
            'Missing or invalid input format. Use abc or musicxml, or provide input_artifact_id.',
            400,
        );
    }

    if (!effectiveContent.trim()) {
        throw new MusicServiceError(
            'Missing content (or text), or referenced artifact has empty content.',
            400,
        );
    }

    const inputArtifact = sourceArtifact ?? await createScoreArtifact({
        format: effectiveInputFormat,
        content: effectiveContent,
        filename,
        label: 'conversion-input',
        metadata: {
            origin: 'api/music/convert',
        },
    });

    const result = await convertMusicNotation({
        inputFormat: effectiveInputFormat,
        outputFormat,
        content: effectiveContent,
        filename,
        validate,
        deepValidate,
        timeoutMs,
    });

    const outputArtifact = await createScoreArtifact({
        format: result.outputFormat,
        content: result.content,
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
            inputArtifactId: inputArtifact.id,
            outputArtifactId: outputArtifact.id,
            inputArtifact: summarizeScoreArtifact(inputArtifact),
            outputArtifact: summarizeScoreArtifact(outputArtifact),
            conversion: {
                inputFormat: result.inputFormat,
                outputFormat: result.outputFormat,
                normalization: result.normalization,
                validation: result.validation,
                provenance: result.provenance,
            },
            content: includeContent ? result.content : undefined,
        },
    };
}

