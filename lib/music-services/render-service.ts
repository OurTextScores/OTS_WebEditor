import { renderMusicSnapshot } from '../music-conversion';
import { summarizeScoreArtifact } from '../score-artifacts';
import { asRecord, resolveScoreContent } from './common';

type RenderServiceResult = {
    status: number;
    body: Record<string, unknown>;
};

export async function runMusicRenderService(body: unknown): Promise<RenderServiceResult> {
    const data = asRecord(body);
    const resolution = await resolveScoreContent(body);
    if (resolution.error) {
        return resolution.error as RenderServiceResult;
    }

    const { xml, artifact: inputArtifact, session } = resolution;
    
    const format = (data?.format === 'pdf' ? 'pdf' : 'png') as 'pdf' | 'png';
    const dpi = typeof data?.dpi === 'number' ? data.dpi : undefined;

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
                scoreSessionId: session?.scoreSessionId ?? null,
                revision: session?.revision ?? null,
                inputArtifactId: inputArtifact?.id ?? null,
                inputArtifact: inputArtifact ? summarizeScoreArtifact(inputArtifact) : null,
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
