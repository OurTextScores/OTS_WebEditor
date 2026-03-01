import { getScoreArtifact, summarizeScoreArtifact, type ScoreArtifact } from '../score-artifacts';
import { type TraceContext, withTraceHeaders } from '../trace-http';
import { asRecord, resolveScoreContent } from './common';

type PatchServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

export async function runMusicPatchService(
  body: unknown,
  options?: { traceContext?: TraceContext },
): Promise<PatchServiceResult> {
  const data = asRecord(body);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  const model = typeof data?.model === 'string' ? data.model.trim() : 'gpt-4o';
  // Allow passing key in request body
  const apiKey = (typeof data?.apiKey === 'string' ? data.apiKey : (typeof data?.api_key === 'string' ? data.api_key : '')).trim();
  const retried = Boolean(data?.retried);

  if (!prompt) {
    return {
      status: 400,
      body: { error: 'Missing prompt for music patch service.' },
    };
  }

  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error as PatchServiceResult;
  }

  const { xml, artifact: resolutionArtifact, session } = resolution;

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const finalApiKey = apiKey || process.env.OPENAI_API_KEY;

  if (!finalApiKey) {
    return {
      status: 401,
      body: { error: 'Missing OpenAI API key.' },
    };
  }

  // Implementation of patch generation via OpenAI Responses API
  // (We keep the existing logic but use the resolved XML)
  
  const systemPrompt = `You are a music notation expert specializing in MusicXML.
Generate a surgical XML patch for the provided score based on the user's prompt.
Output ONLY a JSON object in the format: { "patch": { "format": "musicxml-patch@1", "ops": [...] } }
Do not include any other text or explanation.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalApiKey}`,
        ...withTraceHeaders({}, options?.traceContext),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Score Content:\n${xml}\n\nUser Prompt: ${prompt}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[patch-service] OpenAI error:', errorText);
      return {
        status: response.status,
        body: { error: `OpenAI API error: ${response.status}`, details: errorText },
      };
    }

    const result = await response.json();
    const attemptText = result.choices?.[0]?.message?.content || '';

    if (!attemptText) {
      return {
        status: 502,
        body: { error: 'OpenAI returned an empty response.' },
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(attemptText);
    } catch (err) {
      console.error('[patch-service] Failed to parse AI JSON:', attemptText);
      return {
        status: 502,
        body: { error: 'AI returned invalid JSON.', text: attemptText },
      };
    }

    if (!parsed?.patch?.ops) {
      return {
        status: 502,
        body: { error: 'AI returned JSON missing patch ops.', text: attemptText },
      };
    }

    const sourceArtifact = resolutionArtifact;

    return {
      status: 200,
      body: {
        mode: 'v1/responses',
        model,
        scoreSessionId: session?.scoreSessionId ?? null,
        revision: session?.revision ?? null,
        inputArtifactId: sourceArtifact?.id || null,
        inputArtifact: sourceArtifact ? summarizeScoreArtifact(sourceArtifact) : null,
        patch: parsed.patch,
        text: attemptText,
        retried,
      },
    };
  } catch (error) {
    console.error('[patch-service] Request failed:', error);
    return {
      status: 500,
      body: { error: error instanceof Error ? error.message : 'Internal patch service error.' },
    };
  }
}
