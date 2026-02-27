import { NextResponse } from 'next/server';
import { runMusicGenerateService } from '../../../../lib/music-services/generate-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    const result = await runMusicGenerateService(await request.json());
    return NextResponse.json(result.body, { status: result.status });
}

