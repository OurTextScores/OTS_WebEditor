import { renderMusicSnapshot } from '../music-conversion';
import { getScoreArtifact, type ScoreArtifact } from '../score-artifacts';
import { MusicServiceError } from './errors';

type RenderServiceResult = {
    status: number;
    body: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

export async function runMusicRenderService(body: unknown): Promise<RenderServiceResult> {
    const data = asRecord(body);
    const contentInput = typeof data?.content === 'string'
        ? data.content
        : (typeof data?.text === 'string' ? data.text : '');
    const inputArtifactId = typeof data?.input_artifact_id === 'string'
        ? data.input_artifact_id.trim()
        : (typeof data?.inputArtifactId === 'string' ? data.inputArtifactId.trim() : '');
    
    const format = (data?.format === 'pdf' ? 'pdf' : 'png') as 'pdf' | 'png';
    const dpi = typeof data?.dpi === 'number' ? data.dpi : undefined;

    let xml = contentInput;
    if (inputArtifactId) {
        const sourceArtifact = await getScoreArtifact(inputArtifactId);
        if (!sourceArtifact) {
            throw new MusicServiceError('Input artifact not found.', 404);
        }
        if (sourceArtifact.format !== 'musicxml') {
            throw new MusicServiceError('Rendering currently supports musicxml artifacts only.', 400);
        }
        xml = sourceArtifact.content;
    }

    if (!xml.trim()) {
        throw new MusicServiceError('Missing content (or text), or referenced artifact has empty content.', 400);
    }

    // Future: Handle measure ranges here if we want to render snippets
    // For now, render the full content provided.

    try {
        const { buffer, mimeType } = await renderMusicSnapshot({
            content: xml,
            format,
            dpi,
        });

        const base64 = buffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;

        return {
            status: 200,
            body: {
                format,
                mimeType,
                dataUrl,
                // Include a snippet of the data URL for logging/visibility in agent response if needed,
                // but usually the SDK handles the full payload.
            },
        };
    } catch (error) {
        console.error('[render-service] MuseScore render failed:', error);
        return {
            status: 500,
            body: {
                error: error instanceof Error ? error.message : 'MuseScore render failed.',
            },
        };
    }
}
