import { NextResponse } from 'next/server';
import { runMusicScoreOpsService } from '../../../../../lib/music-services/scoreops-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const result = await runMusicScoreOpsService(await request.json(), 'apply');
  return NextResponse.json(result.body, { status: result.status });
}
