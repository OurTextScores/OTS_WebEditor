import { getScoreArtifact, summarizeScoreArtifact, type ScoreArtifact } from '../score-artifacts';

type PatchServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

type MusicXmlPatchOp = {
  op: 'replace' | 'setText' | 'setAttr' | 'insertBefore' | 'insertAfter' | 'delete';
  path: string;
  value?: string;
  name?: string;
};

type MusicXmlPatch = {
  format: 'musicxml-patch@1';
  ops: MusicXmlPatchOp[];
};

const DEFAULT_MODEL = (process.env.MUSIC_PATCH_MODEL || process.env.MUSIC_AGENT_MODEL || 'gpt-5.2').trim();
const DEFAULT_MAX_TOKENS = 4000;
const MAX_MAX_TOKENS = 16000;

const PATCH_SYSTEM_PROMPT = [
  'You are a MusicXML editor.',
  'Return only a valid JSON object for musicxml-patch@1.',
  'Do not include markdown fences.',
  'Prefer minimal surgical ops (setText/setAttr/delete) over large replace ops.',
].join(' ');

const PATCH_SPEC = `Return ONLY valid JSON in the following format:
{
  "format": "musicxml-patch@1",
  "ops": [
    { "op": "replace", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "setText", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]/duration", "value": "2" },
    { "op": "setAttr", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "name": "default-x", "value": "123.45" },
    { "op": "insertAfter", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[1]", "value": "<note>...</note>" },
    { "op": "delete", "path": "/score-partwise/part[@id='P1']/measure[@number='1']/note[2]" }
  ]
}
Use ONLY these ops: replace, setText, setAttr, insertBefore, insertAfter, delete.
Each XPath must match exactly one node.
Prefer small focused changes; avoid replacing entire measures unless truly necessary.`;

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

function readBoolean(camel: unknown, snake: unknown, fallback: boolean) {
  if (typeof camel === 'boolean') {
    return camel;
  }
  if (typeof snake === 'boolean') {
    return snake;
  }
  return fallback;
}

function readBoundedNumber(
  camel: unknown,
  snake: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const candidate = Number(camel ?? snake);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  const rounded = Math.trunc(candidate);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

function looksLikeMusicXml(xml: string) {
  const normalized = xml.trim().toLowerCase();
  return normalized.startsWith('<?xml')
    || normalized.includes('<score-partwise')
    || normalized.includes('<score-timewise');
}

function extractJsonFromResponse(responseText: string) {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return responseText.trim();
}

function parsePatchObject(input: unknown): { patch: MusicXmlPatch | null; error: string } {
  const parsed = asRecord(input);
  const format = typeof parsed?.format === 'string' ? parsed.format : '';
  const opsRaw = Array.isArray(parsed?.ops) ? parsed.ops : null;
  if (format !== 'musicxml-patch@1' || !opsRaw) {
    return { patch: null, error: 'Model response is not a musicxml-patch@1 payload.' };
  }
  const ops: MusicXmlPatchOp[] = [];
  const allowedOps = new Set(['replace', 'setText', 'setAttr', 'insertBefore', 'insertAfter', 'delete']);
  for (let i = 0; i < opsRaw.length; i += 1) {
    const op = asRecord(opsRaw[i]);
    const opName = typeof op?.op === 'string' ? op.op : '';
    if (!allowedOps.has(opName)) {
      return { patch: null, error: `Patch op ${i + 1} has unsupported op "${opName}".` };
    }
    const path = typeof op?.path === 'string' ? op.path.trim() : '';
    if (!path) {
      return { patch: null, error: `Patch op ${i + 1} is missing a valid path.` };
    }
    const nextOp: MusicXmlPatchOp = { op: opName as MusicXmlPatchOp['op'], path };
    if (opName === 'setText' || opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
      if (typeof op?.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      nextOp.value = op.value;
    }
    if (opName === 'setAttr') {
      if (typeof op?.name !== 'string' || !op.name.trim()) {
        return { patch: null, error: `Patch op ${i + 1} requires an attribute name.` };
      }
      if (typeof op?.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      nextOp.name = op.name;
      nextOp.value = op.value;
    }
    ops.push(nextOp);
  }
  return { patch: { format: 'musicxml-patch@1', ops }, error: '' };
}

function parsePatchFromText(text: string): { patch: MusicXmlPatch | null; error: string } {
  if (!text.trim()) {
    return { patch: null, error: 'Model returned an empty response.' };
  }
  try {
    const extracted = extractJsonFromResponse(text);
    const payload = JSON.parse(extracted);
    return parsePatchObject(payload);
  } catch {
    return { patch: null, error: 'Model response is not valid JSON.' };
  }
}

const parseResponsesText = (data: unknown) => {
  const record = asRecord(data);
  if (typeof record?.output_text === 'string') {
    return record.output_text;
  }
  const output = Array.isArray(record?.output) ? record.output : [];
  for (const item of output) {
    const message = asRecord(item);
    if (message?.type !== 'message') {
      continue;
    }
    const content = Array.isArray(message?.content) ? message.content : [];
    const text = content
      .map((part) => {
        const piece = asRecord(part);
        return typeof piece?.text === 'string' ? piece.text : '';
      })
      .join('');
    if (text.trim()) {
      return text;
    }
  }
  return '';
};

function buildPrompt(prompt: string, xml: string) {
  return `${prompt}\n\nCurrent MusicXML:\n${xml}\n\n${PATCH_SPEC}`;
}

function buildRepairPrompt(prompt: string, previousInvalidResponse: string) {
  return [
    'Your previous answer was not valid JSON.',
    'Return ONLY valid JSON for musicxml-patch@1.',
    'Keep the same intended edits, but make the JSON syntactically valid and complete.',
    'Do not include markdown, prose, or explanation.',
    `Original edit request:\n${prompt}`,
    `Invalid previous response:\n${previousInvalidResponse}`,
    PATCH_SPEC,
  ].join('\n\n');
}

function selectXmlFromBody(data: Record<string, unknown>, sourceArtifact: ScoreArtifact | null) {
  if (sourceArtifact) {
    return sourceArtifact.content;
  }
  if (typeof data.content === 'string' && data.content.trim()) {
    return data.content;
  }
  if (typeof data.text === 'string' && data.text.trim()) {
    return data.text;
  }
  return '';
}

export async function runMusicPatchService(body: unknown): Promise<PatchServiceResult> {
  const data = asRecord(body) || {};
  const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
  const model = (typeof data.model === 'string' ? data.model.trim() : '') || DEFAULT_MODEL;
  const maxTokens = readBoundedNumber(data.maxTokens, data.max_tokens, DEFAULT_MAX_TOKENS, 1, MAX_MAX_TOKENS);
  const dryRun = readBoolean(data.dryRun, data.dry_run, false);

  const inputArtifactIdRaw = typeof data.inputArtifactId === 'string'
    ? data.inputArtifactId
    : (typeof data.input_artifact_id === 'string' ? data.input_artifact_id : '');
  const inputArtifactId = inputArtifactIdRaw.trim();
  const sourceArtifact = inputArtifactId ? await getScoreArtifact(inputArtifactId) : null;
  if (inputArtifactId && !sourceArtifact) {
    return {
      status: 404,
      body: { error: 'Input artifact not found.' },
    };
  }

  const xml = selectXmlFromBody(data, sourceArtifact);
  if (!prompt) {
    return {
      status: 400,
      body: { error: 'Missing prompt for music patch generation.' },
    };
  }
  if (!xml.trim()) {
    return {
      status: 400,
      body: { error: 'Missing MusicXML content for patch generation.' },
    };
  }
  if (!looksLikeMusicXml(xml)) {
    return {
      status: 400,
      body: { error: 'Input does not look like MusicXML.' },
    };
  }

  if (dryRun) {
    return {
      status: 200,
      body: {
        ready: false,
        message: 'Dry-run only. Set dryRun=false to generate a patch.',
        request: {
          model,
          maxTokens,
          promptPreview: prompt.slice(0, 500),
          xmlLength: xml.length,
          inputArtifactId: sourceArtifact?.id || null,
        },
      },
    };
  }

  const apiKey = (typeof data.apiKey === 'string'
    ? data.apiKey
    : (typeof data.api_key === 'string' ? data.api_key : process.env.OPENAI_API_KEY || '')).trim();
  if (!apiKey) {
    return {
      status: 400,
      body: { error: 'Missing OpenAI API key for music patch generation.' },
    };
  }

  const requestPatchText = async (input: string) => {
    const responsePayload: Record<string, unknown> = {
      model,
      instructions: PATCH_SYSTEM_PROMPT,
      input,
      temperature: 0,
      max_output_tokens: maxTokens,
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(responsePayload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false as const,
        status: response.status,
        error: errorText || 'OpenAI patch generation request failed.',
      };
    }
    const dataJson = await response.json();
    return {
      ok: true as const,
      status: 200,
      text: parseResponsesText(dataJson),
    };
  };

  const firstAttempt = await requestPatchText(buildPrompt(prompt, xml));
  if (!firstAttempt.ok) {
    return {
      status: firstAttempt.status,
      body: {
        error: firstAttempt.error,
      },
    };
  }

  let attemptText = firstAttempt.text;
  let parsed = parsePatchFromText(attemptText);
  let retried = false;

  if (!parsed.patch) {
    retried = true;
    const secondAttempt = await requestPatchText(buildRepairPrompt(prompt, attemptText));
    if (!secondAttempt.ok) {
      return {
        status: secondAttempt.status,
        body: {
          error: secondAttempt.error,
        },
      };
    }
    attemptText = secondAttempt.text;
    parsed = parsePatchFromText(attemptText);
  }

  if (!parsed.patch) {
    return {
      status: 422,
      body: {
        error: parsed.error,
        text: attemptText,
        retried,
      },
    };
  }

  return {
    status: 200,
    body: {
      mode: 'openai-responses',
      model,
      inputArtifactId: sourceArtifact?.id || null,
      inputArtifact: sourceArtifact ? summarizeScoreArtifact(sourceArtifact) : null,
      patch: parsed.patch,
      text: attemptText,
      retried,
    },
  };
}
