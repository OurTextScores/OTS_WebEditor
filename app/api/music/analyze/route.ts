import { NextResponse } from 'next/server';
import { getScoreArtifact, summarizeScoreArtifact } from '../../../../lib/score-artifacts';

export const runtime = 'nodejs';

const DEFAULT_CHATMUSICIAN_MODEL_ID = (process.env.MUSIC_CHATMUSICIAN_DEFAULT_MODEL_ID || '').trim();
const DEFAULT_CHATMUSICIAN_REVISION = (process.env.MUSIC_CHATMUSICIAN_DEFAULT_REVISION || '').trim();

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
        const modelId = readTrimmedString(data?.modelId ?? data?.model_id) || DEFAULT_CHATMUSICIAN_MODEL_ID;
        const revision = readTrimmedString(data?.revision) || DEFAULT_CHATMUSICIAN_REVISION;
        const question = readTrimmedString(data?.question ?? data?.prompt);
        const inputArtifactId = readTrimmedString(data?.inputArtifactId ?? data?.input_artifact_id ?? data?.artifactId ?? data?.artifact_id);
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
            return NextResponse.json({ error: 'Missing modelId for ChatMusician.' }, { status: 400 });
        }
        if (!inputArtifactId) {
            return NextResponse.json({ error: 'Missing inputArtifactId (score artifact to analyze).' }, { status: 400 });
        }
        if (!question) {
            return NextResponse.json({ error: 'Missing question (or prompt).' }, { status: 400 });
        }

        const inputArtifact = await getScoreArtifact(inputArtifactId);
        if (!inputArtifact) {
            return NextResponse.json({ error: 'Input artifact not found.' }, { status: 404 });
        }

        const payload = {
            ready: false,
            specialist: 'chatmusician',
            backend: 'huggingface',
            message: 'Analyze route scaffold is wired. Hugging Face invocation adapter and prompt/ABC extraction pipeline are not implemented yet.',
            request: {
                modelId,
                revision: revision || null,
                question,
                dryRun,
                inputArtifactId: inputArtifact.id,
            },
            auth: {
                tokenProvided: true,
                tokenPreview: maskToken(hfToken),
            },
            inputArtifact: summarizeScoreArtifact(inputArtifact),
            next: [
                'Build analysis prompt from artifact content (MusicXML and/or ABC).',
                'Call Hugging Face inference with the user token (server-side proxy).',
                'Return analysis text + optional derived artifacts/snippets.',
            ],
        };

        if (dryRun) {
            return NextResponse.json(payload);
        }
        return NextResponse.json(payload, { status: 501 });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Music analyze route error.',
        }, { status: 500 });
    }
}
