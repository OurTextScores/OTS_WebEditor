import { NextResponse } from 'next/server';
import { runMusicConvertService } from '../../../../lib/music-services/convert-service';
import { MusicServiceError } from '../../../../lib/music-services/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const result = await runMusicConvertService(await request.json());
        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        if (error instanceof MusicServiceError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        const message = error instanceof Error ? error.message : 'Music conversion error.';
        const status = /tools unavailable/i.test(message) ? 503 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
