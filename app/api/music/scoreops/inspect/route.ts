import { NextResponse } from 'next/server';
import { runMusicScoreOpsService } from '../../../../../lib/music-services/scoreops-service';
import { applyTraceHeaders, resolveTraceContext } from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const trace = resolveTraceContext(request);
  const result = await runMusicScoreOpsService(await request.json(), 'inspect');
  const response = NextResponse.json(result.body, { status: result.status });
  applyTraceHeaders(response.headers, trace);
  return response;
}
