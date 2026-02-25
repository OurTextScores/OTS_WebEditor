import { NextResponse } from 'next/server';
import { getScoreArtifact, summarizeScoreArtifact } from '../../../../lib/score-artifacts';

export const runtime = 'nodejs';

const DEFAULT_NOTAGEN_MODEL_ID = (process.env.MUSIC_NOTAGEN_DEFAULT_MODEL_ID || '').trim();
const DEFAULT_NOTAGEN_REVISION = (process.env.MUSIC_NOTAGEN_DEFAULT_REVISION || '').trim();

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const maskToken = (token: string) => {
    if (!token) {
        return '';
    }
    if (token.length <= 8) {
        return `${token.slice(0, 2)}***`;
    }
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = asRecord(body);

        const backend = readTrimmedString(data?.backend || 'huggingface') || 'huggingface';
        const hfToken = readTrimmedString(data?.hfToken ?? data?.hf_token);
        const modelId = readTrimmedString(data?.modelId ?? data?.model_id) || DEFAULT_NOTAGEN_MODEL_ID;
        const revision = readTrimmedString(data?.revision) || DEFAULT_NOTAGEN_REVISION;
        const prompt = readTrimmedString(data?.prompt);
        const inputArtifactId = readTrimmedString(data?.inputArtifactId ?? data?.input_artifact_id ?? data?.seedArtifactId ?? data?.seed_artifact_id);
        const dryRun = typeof data?.dryRun === 'boolean'
            ? data.dryRun
            : (typeof data?.dry_run === 'boolean' ? data.dry_run : true);

        if (backend !== 'huggingface') {
            return NextResponse.json({ error: 'Only huggingface backend is supported in this scaffold.' }, { status: 400 });
        }
        if (!hfToken) {
            return NextResponse.json({ error: 'Missing hfToken (BYO Hugging Face token).' }, { status: 400 });
        }
        if (!modelId) {
            return NextResponse.json({ error: 'Missing modelId for NotaGen.' }, { status: 400 });
        }

        const seedArtifact = inputArtifactId ? await getScoreArtifact(inputArtifactId) : null;
        if (inputArtifactId && !seedArtifact) {
            return NextResponse.json({ error: 'Seed/input artifact not found.' }, { status: 404 });
        }

        const payload = {
            ready: false,
            specialist: 'notagen',
            backend: 'huggingface',
            message: 'Generate route scaffold is wired. Hugging Face invocation adapter and ABC post-processing pipeline are not implemented yet.',
            request: {
                modelId,
                revision: revision || null,
                prompt,
                dryRun,
                seedArtifactId: seedArtifact?.id || null,
            },
            auth: {
                tokenProvided: true,
                tokenPreview: maskToken(hfToken),
            },
            seedArtifact: seedArtifact ? summarizeScoreArtifact(seedArtifact) : null,
            next: [
                'Call Hugging Face inference with the user token (server-side proxy).',
                'Normalize/generate ABC output.',
                'Convert ABC -> MusicXML via /api/music/convert and persist output artifacts.',
            ],
        };

        if (dryRun) {
            return NextResponse.json(payload);
        }
        return NextResponse.json(payload, { status: 501 });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Music generate route error.',
        }, { status: 500 });
    }
}
