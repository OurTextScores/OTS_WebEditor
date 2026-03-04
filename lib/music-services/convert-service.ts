import {
    convertMusicNotation,
    ensureMusicConversionToolsAvailable,
    normalizeMusicFormat,
} from '../music-conversion';
import {
    createScoreArtifact,
    summarizeScoreArtifact,
} from '../score-artifacts';
import { asRecord, readBoolean, resolveScoreContent } from './common';

type ConvertServiceResult = {
    status: number;
    body: Record<string, unknown>;
};

export async function runMusicConvertService(body: unknown): Promise<ConvertServiceResult> {
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

    const inputFormatHint = normalizeMusicFormat(data?.input_format ?? data?.inputFormat);
    const outputFormat = normalizeMusicFormat(data?.output_format ?? data?.outputFormat);
    if (!outputFormat) {
        return {
            status: 400,
            body: { error: 'Missing or invalid output format. Use abc or musicxml.' },
        };
    }

    const resolution = await resolveScoreContent(body);
    if (resolution.error) {
        return resolution.error as ConvertServiceResult;
    }

    const { xml, artifact: resolutionArtifact, session } = resolution;
    const filename = typeof data?.filename === 'string' ? data.filename : undefined;
    const validate = readBoolean(data?.validate, undefined, true);
    const deepValidate = readBoolean(data?.deepValidate, data?.deep_validate, true);
    const includeContent = readBoolean(data?.includeContent, data?.include_content, false);
    const timeoutMsRaw = Number(data?.timeoutMs ?? data?.timeout_ms);
    const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : undefined;

    // Direct resolution artifact or session context
    let inputArtifact = resolutionArtifact;
    const inputFormat = inputFormatHint ?? inputArtifact?.format ?? 'musicxml';
    const inputContent = xml;

    if (!inputArtifact) {
        inputArtifact = await createScoreArtifact({
            format: inputFormat,
            content: inputContent,
            filename,
            label: 'conversion-input',
            metadata: {
                origin: 'api/music/convert',
            },
        });
    }

    const result = await convertMusicNotation({
        inputFormat,
        outputFormat,
        content: inputContent,
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
            scoreSessionId: session?.scoreSessionId ?? null,
            revision: session?.revision ?? null,
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
