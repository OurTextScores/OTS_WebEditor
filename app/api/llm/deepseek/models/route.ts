import { handleOpenAiCompatibleModelsRequest } from '../../openai-compatible';

export const dynamic = 'force-static';

export async function POST(request: Request) {
    return handleOpenAiCompatibleModelsRequest('deepseek', request);
}

