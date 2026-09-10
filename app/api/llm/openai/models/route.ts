import { NextResponse } from 'next/server';
import { requireSensitiveApiAccess } from '../../../../../lib/api-access-control';
import {
  applyTraceHeaders,
  resolveTraceContext,
  withTraceHeaders,
} from '../../../../../lib/trace-http';
import {
  buildAiModelDescriptorsFromProviderResponse,
  rememberDiscoveredAiModelDescriptors,
} from '../../../../../lib/ai-model-capabilities';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const trace = resolveTraceContext(request);
  const tracedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyTraceHeaders(response.headers, trace);
    return response;
  };
  const access = requireSensitiveApiAccess({
    request,
    trace,
    route: '/api/llm/openai/models',
    allowUnauthenticatedEnvVar: 'ALLOW_UNAUTHENTICATED_LLM_PROXY',
  });
  if (!access.ok) {
    return access.response;
  }
  try {
    const body = await request.json();
    const apiKey = String(body?.apiKey || '').trim();
    if (!apiKey) {
      return tracedJson({ error: 'Missing apiKey.' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: withTraceHeaders(trace, {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      return tracedJson(
        { error: 'OpenAI request failed.', providerStatus: response.status },
        { status: response.status },
      );
    }

    const data = await response.json();
    const modelDescriptors = buildAiModelDescriptorsFromProviderResponse('openai', data);
    rememberDiscoveredAiModelDescriptors(modelDescriptors);
    const models = modelDescriptors.map((descriptor) => descriptor.id);
    return tracedJson({ models, modelDescriptors });
  } catch (err) {
    console.error('OpenAI models proxy error', err);
    return tracedJson({ error: 'OpenAI models proxy error.' }, { status: 500 });
  }
}
