import { handleOpenAiCompatibleModelsRequest } from '../../openai-compatible';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleOpenAiCompatibleModelsRequest('kimi', request);
}
