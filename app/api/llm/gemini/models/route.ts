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
    route: '/api/llm/gemini/models',
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

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: withTraceHeaders(trace, {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
      return tracedJson(
        { error: 'Gemini request failed.', providerStatus: response.status },
        { status: response.status },
      );
    }

    const data = await response.json();
    const modelDescriptors = buildAiModelDescriptorsFromProviderResponse('gemini', data);
    rememberDiscoveredAiModelDescriptors(modelDescriptors);
    const models = modelDescriptors.map((descriptor) => descriptor.id);
    return tracedJson({ models, modelDescriptors });
  } catch (err) {
    console.error('Gemini models proxy error', err);
    return tracedJson({ error: 'Gemini models proxy error.' }, { status: 500 });
  }
}
