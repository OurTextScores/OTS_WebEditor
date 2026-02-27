import { resolveScoreEditorApiPath } from './score-editor-api-client';

type MusicSpecialistBackend = 'huggingface';

type BaseMusicSpecialistRequest = {
    backend?: MusicSpecialistBackend;
    hfToken: string;
    modelId: string;
    revision?: string;
    dryRun?: boolean;
};

export type MusicGenerateRequest = BaseMusicSpecialistRequest & {
    prompt?: string;
    inputArtifactId?: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof asRecord(data)?.error === 'string'
            ? String(asRecord(data)?.error)
            : `Request failed: ${response.status}`;
        throw new Error(message);
    }
    return data as T;
}

export async function callMusicGenerate(request: MusicGenerateRequest) {
    return await postJson(resolveScoreEditorApiPath('/api/music/generate'), {
        backend: request.backend || 'huggingface',
        hfToken: request.hfToken,
        modelId: request.modelId,
        revision: request.revision,
        prompt: request.prompt,
        inputArtifactId: request.inputArtifactId,
        dryRun: request.dryRun,
    });
}

export const MusicSpecialistsTool = {
    generate: callMusicGenerate,
};
