import { handleOpenAiCompatibleRequest } from '../openai-compatible';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleOpenAiCompatibleRequest('grok', request);
}
