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

const ANTHROPIC_VERSION = '2023-06-01';

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
    route: '/api/llm/anthropic/models',
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

    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: withTraceHeaders(trace, {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      return tracedJson(
        { error: 'Anthropic request failed.', providerStatus: response.status },
        { status: response.status },
      );
    }

    const data = await response.json();
    const normalizedData =
      Array.isArray(data?.models) && !Array.isArray(data?.data) ? { data: data.models } : data;
    const modelDescriptors = buildAiModelDescriptorsFromProviderResponse(
      'anthropic',
      normalizedData,
    );
    rememberDiscoveredAiModelDescriptors(modelDescriptors);
    const models = modelDescriptors.map((descriptor) => descriptor.id);
    return tracedJson({ models, modelDescriptors });
  } catch (err) {
    console.error('Anthropic models proxy error', err);
    return tracedJson({ error: 'Anthropic models proxy error.' }, { status: 500 });
  }
}
