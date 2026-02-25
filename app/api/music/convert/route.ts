import { NextResponse } from 'next/server';
import {
    convertMusicNotation,
    ensureMusicConversionToolsAvailable,
    normalizeMusicFormat,
} from '../../../../lib/music-conversion';
import {
    createScoreArtifact,
    getScoreArtifact,
    summarizeScoreArtifact,
} from '../../../../lib/score-artifacts';

export const runtime = 'nodejs';

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = asRecord(body);

        const healthCheck = typeof data?.healthCheck === 'boolean'
            ? data.healthCheck
            : (typeof data?.health_check === 'boolean' ? data.health_check : false);
        if (healthCheck) {
            const tools = await ensureMusicConversionToolsAvailable();
            return NextResponse.json({
                ok: tools.ok,
                engine: 'notagen',
                scripts: {
                    xml2abc: tools.config.xml2abcScript,
                    abc2xml: tools.config.abc2xmlScript,
                },
                pythonCommand: tools.config.pythonCommand,
                missing: tools.missing,
            }, { status: tools.ok ? 200 : 503 });
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
        const validate = typeof data?.validate === 'boolean' ? data.validate : true;
        const deepValidate = typeof data?.deepValidate === 'boolean'
            ? data.deepValidate
            : (typeof data?.deep_validate === 'boolean' ? data.deep_validate : true);
        const includeContent = typeof data?.includeContent === 'boolean'
            ? data.includeContent
            : (typeof data?.include_content === 'boolean' ? data.include_content : false);
        const timeoutMsRaw = Number(data?.timeoutMs ?? data?.timeout_ms);
        const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : undefined;

        if (!outputFormat) {
            return NextResponse.json({
                error: 'Missing or invalid output format. Use abc or musicxml.',
            }, { status: 400 });
        }

        let effectiveInputFormat = inputFormat;
        let effectiveContent = contentInput;
        let sourceArtifact = null;

        if (inputArtifactId) {
            sourceArtifact = await getScoreArtifact(inputArtifactId);
            if (!sourceArtifact) {
                return NextResponse.json({ error: 'Input artifact not found.' }, { status: 404 });
            }
            effectiveInputFormat = sourceArtifact.format;
            effectiveContent = sourceArtifact.content;
        }

        if (!effectiveInputFormat) {
            return NextResponse.json({
                error: 'Missing or invalid input format. Use abc or musicxml, or provide input_artifact_id.',
            }, { status: 400 });
        }

        if (!effectiveContent.trim()) {
            return NextResponse.json({
                error: 'Missing content (or text), or referenced artifact has empty content.',
            }, { status: 400 });
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
            },
        });

        return NextResponse.json({
            inputArtifactId: inputArtifact.id,
            outputArtifactId: outputArtifact.id,
            inputArtifact: summarizeScoreArtifact(inputArtifact),
            outputArtifact: summarizeScoreArtifact(outputArtifact),
            conversion: {
                inputFormat: result.inputFormat,
                outputFormat: result.outputFormat,
                validation: result.validation,
                provenance: result.provenance,
            },
            content: includeContent ? result.content : undefined,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Music conversion error.';
        const status = /tools unavailable/i.test(message) ? 503 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
