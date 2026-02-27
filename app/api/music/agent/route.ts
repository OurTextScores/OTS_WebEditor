import { NextResponse } from 'next/server';
import { runMusicAgentRouter } from '../../../../lib/music-agents/router';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const result = await runMusicAgentRouter(await request.json());
  return NextResponse.json(result.body, { status: result.status });
}

