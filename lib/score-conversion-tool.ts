import type { MusicFormat, MusicConversionResult } from './music-conversion';
import type { ScoreArtifact, ScoreArtifactSummary } from './score-artifacts';
import { resolveScoreEditorApiPath } from './score-editor-api-client';

export type ScoreConversionToolRequest = {
    inputFormat?: MusicFormat | 'xml' | 'mxl';
    outputFormat: MusicFormat | 'xml' | 'mxl';
    content?: string;
    filename?: string;
    validate?: boolean;
    deepValidate?: boolean;
    timeoutMs?: number;
    inputArtifactId?: string;
    includeContent?: boolean;
};

export type ScoreConversionToolResponse = {
    inputArtifactId: string;
    outputArtifactId: string;
    inputArtifact: ScoreArtifactSummary;
    outputArtifact: ScoreArtifactSummary;
    conversion: Omit<MusicConversionResult, 'content'>;
    content?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

export async function convertScoreNotation(request: ScoreConversionToolRequest): Promise<ScoreConversionToolResponse> {
    const response = await fetch(resolveScoreEditorApiPath('/api/music/convert'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input_format: request.inputFormat,
            output_format: request.outputFormat,
            content: request.content,
            filename: request.filename,
            validate: request.validate,
            deep_validate: request.deepValidate,
            timeout_ms: request.timeoutMs,
            input_artifact_id: request.inputArtifactId,
            include_content: request.includeContent,
        }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof asRecord(data)?.error === 'string'
            ? String(asRecord(data)?.error)
            : 'Score conversion request failed.';
        throw new Error(message);
    }

    return data as ScoreConversionToolResponse;
}

export async function getScoreArtifactById(id: string, options?: { includeContent?: boolean }): Promise<ScoreArtifact | ScoreArtifactSummary> {
    const response = await fetch(resolveScoreEditorApiPath('/api/music/artifacts/get'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            id,
            include_content: Boolean(options?.includeContent),
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof asRecord(data)?.error === 'string'
            ? String(asRecord(data)?.error)
            : 'Failed to load score artifact.';
        throw new Error(message);
    }
    return (asRecord(data)?.artifact ?? null) as ScoreArtifact | ScoreArtifactSummary;
}

export const ScoreConversionTool = {
    convert: convertScoreNotation,
    getArtifactById: getScoreArtifactById,
};
