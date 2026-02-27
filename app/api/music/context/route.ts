import { NextResponse } from 'next/server';
import { MusicServiceError } from '../../../../lib/music-services/errors';
import { runMusicContextService } from '../../../../lib/music-services/context-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const result = await runMusicContextService(await request.json());
        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof MusicServiceError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        const message = error instanceof Error ? error.message : 'Music context extraction error.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

