import { NextResponse } from 'next/server';
import {
  isConfiguredAppApiToken,
  requireServerCredentialAccess,
} from '../../../../../lib/api-access-control';
import {
  applyTraceHeaders,
  resolveTraceContext,
  withTraceHeaders,
} from '../../../../../lib/trace-http';

export const runtime = 'nodejs';

const DEFAULT_NOTAGEN_SPACE_ID = (
  process.env.MUSIC_NOTAGEN_DEFAULT_SPACE_ID || 'ElectricAlexis/NotaGen'
).trim();
const DEFAULT_SPACE_REVISION = (process.env.MUSIC_NOTAGEN_SPACE_PROMPTS_REVISION || 'main').trim();

const readTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function getPromptsRawUrl(spaceId: string, revision: string) {
  const [owner, ...repoParts] = spaceId.split('/');
  const repo = repoParts.join('/');
  if (!owner || !repo) {
    throw new Error(`Invalid Space ID: ${spaceId}`);
  }
  return `https://huggingface.co/spaces/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/raw/${encodeURIComponent(revision || 'main')}/prompts.txt`;
}

function parsePromptsFile(content: string) {
  const combinations: Record<string, Record<string, string[]>> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parts = line.split('_');
    if (parts.length < 3) {
      continue;
    }
    const period = parts[0]?.trim() || '';
    const instrumentation = parts[parts.length - 1]?.trim() || '';
    const composer = parts.slice(1, -1).join('_').trim();
    if (!period || !composer || !instrumentation) {
      continue;
    }
    combinations[period] ||= {};
    combinations[period][composer] ||= [];
    if (!combinations[period][composer].includes(instrumentation)) {
      combinations[period][composer].push(instrumentation);
    }
  }

  const periods = Object.keys(combinations).sort();
  for (const period of periods) {
    const composerMap = combinations[period] || {};
    for (const composer of Object.keys(composerMap)) {
      composerMap[composer] = [...composerMap[composer]].sort();
    }
  }

  return {
    periods,
    combinations,
  };
}

export async function POST(request: Request) {
  const trace = resolveTraceContext(request);
  const tracedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyTraceHeaders(response.headers, trace);
    return response;
  };
  try {
    const body = await request.json().catch(() => ({}));
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const spaceId = readTrimmedString(data.spaceId) || DEFAULT_NOTAGEN_SPACE_ID;
    const revision = readTrimmedString(data.revision) || DEFAULT_SPACE_REVISION;
    const bearer = readTrimmedString(request.headers.get('authorization'));
    const tokenFromHeader = bearer.toLowerCase().startsWith('bearer ')
      ? bearer.slice(7).trim()
      : '';
    const explicitToken =
      readTrimmedString(data.hfToken ?? data.hf_token) ||
      readTrimmedString(request.headers.get('x-hf-token')) ||
      (isConfiguredAppApiToken(tokenFromHeader) ? '' : tokenFromHeader);
    const defaultToken = (process.env.MUSIC_NOTAGEN_SPACE_TOKEN || '').trim();
    if (!explicitToken && defaultToken) {
      const access = requireServerCredentialAccess({
        request,
        trace,
        route: '/api/music/notagen-space/options',
      });
      if (!access.ok) {
        return access.response;
      }
    }
    const token = explicitToken || defaultToken;

    const response = await fetch(getPromptsRawUrl(spaceId, revision), {
      headers: withTraceHeaders(trace, token ? { Authorization: `Bearer ${token}` } : undefined),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return tracedJson(
        {
          error: `Failed to fetch prompts.txt from Space (${response.status}).`,
          spaceId,
          revision,
          details: body.slice(0, 500),
        },
        { status: response.status },
      );
    }

    const text = await response.text();
    const parsed = parsePromptsFile(text);
    return tracedJson({
      ok: true,
      specialist: 'notagen',
      backend: 'huggingface-space',
      spaceId,
      revision,
      periods: parsed.periods,
      combinations: parsed.combinations,
    });
  } catch (error) {
    return tracedJson(
      {
        error: error instanceof Error ? error.message : 'Failed to load NotaGen Space options.',
      },
      { status: 500 },
    );
  }
}
