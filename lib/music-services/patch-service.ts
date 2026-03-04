import {
  DEFAULT_MODEL_BY_PROVIDER,
  type AiProvider,
  requestAiTextDirect,
} from '../ai-provider-adapters';
import { summarizeScoreArtifact } from '../score-artifacts';
import { type TraceContext } from '../trace-http';
import { asRecord, resolveScoreContent } from './common';

type PatchServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

export type MusicXmlPatchOp = {
  op: 'replace' | 'setText' | 'setAttr' | 'insertBefore' | 'insertAfter' | 'delete';
  path: string;
  value?: string;
  name?: string;
};

export type MusicXmlPatch = {
  format: 'musicxml-patch@1';
  ops: MusicXmlPatchOp[];
};

const AI_PATCH_SYSTEM_PROMPT = 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
const AI_PATCH_STRICT_RETRY_SUFFIX = [
  'IMPORTANT RETRY INSTRUCTIONS:',
  'Return ONLY the raw JSON object for a musicxml-patch@1 payload.',
  'Do not wrap in markdown fences.',
  'Do not include commentary before or after the JSON.',
].join('\n');
const AI_PATCH_REQUEST_RETRY_DELAY_MS = 600;

type XmlDomBindings = {
  DOMParser: new () => DOMParser;
  XMLSerializer: new () => XMLSerializer;
  XPathResult: typeof XPathResult;
  Node: typeof Node;
};

const OPENAI_COMPATIBLE_PROVIDER_SET = new Set<AiProvider>(['openai', 'grok', 'deepseek', 'kimi']);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const resolveProvider = (value: unknown): AiProvider => {
  if (typeof value !== 'string') {
    return 'openai';
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'openai'
    || normalized === 'anthropic'
    || normalized === 'gemini'
    || normalized === 'grok'
    || normalized === 'deepseek'
    || normalized === 'kimi'
  ) {
    return normalized;
  }
  return 'openai';
};

const resolveApiKeyForProvider = (provider: AiProvider, explicitApiKey: string) => {
  if (explicitApiKey.trim()) {
    return explicitApiKey.trim();
  }
  if (provider === 'openai') {
    return (process.env.OPENAI_API_KEY || '').trim();
  }
  if (provider === 'anthropic') {
    return (process.env.ANTHROPIC_API_KEY || '').trim();
  }
  if (provider === 'gemini') {
    return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  }
  if (provider === 'grok') {
    return (process.env.GROK_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  }
  if (provider === 'deepseek') {
    return (process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  }
  if (provider === 'kimi') {
    return (process.env.KIMI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  }
  return '';
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error || ''));

export const extractJsonFromResponse = (responseText: string) => {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return responseText.trim();
};

const buildPromptWithSections = (prompt: string, sections: Array<{ title: string; content: string }>) => {
  const trimmedPrompt = prompt.trim();
  const contextSections = sections
    .map((section) => ({
      title: section.title.trim(),
      content: section.content.trim(),
    }))
    .filter((section) => Boolean(section.title) && Boolean(section.content));
  if (!contextSections.length) {
    return trimmedPrompt;
  }
  const contextText = contextSections
    .map((section, index) => `[Context ${index + 1}] ${section.title}\n${section.content}`)
    .join('\n\n');
  if (!trimmedPrompt) {
    return contextText;
  }
  return `${trimmedPrompt}\n\n${contextText}`;
};

const buildAiPatchPrompt = (prompt: string, xml: string) => {
  const patchSpec = `Return ONLY valid JSON in the following format:
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
Each replace/insertBefore/insertAfter value must contain exactly one XML element.
If you need to add multiple sibling elements, use multiple ops (for example: replace one node, then insertAfter additional nodes).`;

  return buildPromptWithSections(prompt, xml.trim()
    ? [{ title: 'Current MusicXML', content: xml }, { title: 'Patch Format Requirements', content: patchSpec }]
    : [{ title: 'Patch Format Requirements', content: patchSpec }]);
};

export const parseMusicXmlPatch = (text: string) => {
  if (!text.trim()) {
    return { patch: null as MusicXmlPatch | null, error: 'AI response is empty.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { patch: null, error: 'AI response is not valid JSON.' };
  }
  const root = asRecord(parsed);
  const maybePatch = asRecord(root?.patch);
  const payload = maybePatch || root;
  if (!payload || payload.format !== 'musicxml-patch@1' || !Array.isArray(payload.ops)) {
    return { patch: null, error: 'Model response is not a musicxml-patch@1 payload.' };
  }
  const ops: MusicXmlPatchOp[] = [];
  const allowedOps = new Set(['replace', 'setText', 'setAttr', 'insertBefore', 'insertAfter', 'delete']);
  const analyzeXmlFragmentShape = (value: string) => {
    const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+?>|[^<]+/g;
    const tokens = value.match(tokenPattern) || [];
    let depth = 0;
    let topLevelElementCount = 0;
    let hasTopLevelText = false;
    let unbalancedTags = false;
    for (const token of tokens) {
      if (!token) {
        continue;
      }
      if (token.startsWith('<!--') || token.startsWith('<?') || (token.startsWith('<!') && !token.startsWith('<![CDATA['))) {
        continue;
      }
      if (token.startsWith('<![CDATA[')) {
        if (depth === 0 && token.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) {
          hasTopLevelText = true;
        }
        continue;
      }
      if (token.startsWith('</')) {
        if (depth === 0) {
          unbalancedTags = true;
          continue;
        }
        depth -= 1;
        continue;
      }
      if (token.startsWith('<')) {
        const isSelfClosing = /\/>\s*$/.test(token);
        if (depth === 0) {
          topLevelElementCount += 1;
        }
        if (!isSelfClosing) {
          depth += 1;
        }
        continue;
      }
      if (depth === 0 && token.trim()) {
        hasTopLevelText = true;
      }
    }
    if (depth !== 0) {
      unbalancedTags = true;
    }
    return { topLevelElementCount, hasTopLevelText, unbalancedTags };
  };
  for (let i = 0; i < payload.ops.length; i += 1) {
    const op = asRecord(payload.ops[i]);
    if (!op) {
      return { patch: null, error: `Patch op ${i + 1} is not an object.` };
    }
    const opName = typeof op.op === 'string' ? op.op.trim() : '';
    if (!allowedOps.has(opName)) {
      return { patch: null, error: `Patch op ${i + 1} has unsupported op "${opName}".` };
    }
    const path = typeof op.path === 'string' ? op.path.trim() : '';
    if (!path) {
      return { patch: null, error: `Patch op ${i + 1} is missing a valid path.` };
    }
    const nextOp: MusicXmlPatchOp = { op: opName as MusicXmlPatchOp['op'], path };
    if (opName === 'setText' || opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
      if (typeof op.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      if (opName === 'setText' && /[<>]/.test(op.value)) {
        return {
          patch: null,
          error: `Patch op ${i + 1} setText value appears to contain XML. Use replace/insert ops for element changes.`,
        };
      }
      if (opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
        const shape = analyzeXmlFragmentShape(op.value);
        if (shape.unbalancedTags) {
          return { patch: null, error: `Patch op ${i + 1} ${opName} value has unbalanced XML tags.` };
        }
        if (shape.hasTopLevelText) {
          return { patch: null, error: `Patch op ${i + 1} ${opName} value has top-level text; it must contain exactly one XML element.` };
        }
        if (shape.topLevelElementCount !== 1) {
          return {
            patch: null,
            error: `Patch op ${i + 1} ${opName} value has ${shape.topLevelElementCount} top-level elements; expected exactly one. Use multiple ops for sibling elements.`,
          };
        }
      }
      nextOp.value = op.value;
    }
    if (opName === 'setAttr') {
      if (typeof op.name !== 'string' || !op.name.trim()) {
        return { patch: null, error: `Patch op ${i + 1} requires an attribute name.` };
      }
      if (typeof op.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      nextOp.name = op.name;
      nextOp.value = op.value;
    }
    ops.push(nextOp);
  }
  return { patch: { format: 'musicxml-patch@1', ops }, error: '' };
};

async function getXmlDomBindings(): Promise<XmlDomBindings | null> {
  if (
    typeof DOMParser !== 'undefined'
    && typeof XMLSerializer !== 'undefined'
    && typeof XPathResult !== 'undefined'
    && typeof Node !== 'undefined'
  ) {
    return {
      DOMParser,
      XMLSerializer,
      XPathResult,
      Node,
    };
  }

  try {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('', { contentType: 'text/html' });
    return {
      DOMParser: dom.window.DOMParser,
      XMLSerializer: dom.window.XMLSerializer,
      XPathResult: dom.window.XPathResult,
      Node: dom.window.Node,
    };
  } catch {
    return null;
  }
}

export async function applyMusicXmlPatch(baseXml: string, patch: MusicXmlPatch) {
  if (!baseXml.trim()) {
    return { xml: '', error: 'Base MusicXML is empty.' };
  }
  const bindings = await getXmlDomBindings();
  if (!bindings) {
    return { xml: '', error: 'XML parsing is unavailable in this environment.' };
  }

  const parser = new bindings.DOMParser();
  const doc = parser.parseFromString(baseXml, 'application/xml');
  const parserError = doc.querySelector?.('parsererror');
  if (parserError) {
    return { xml: '', error: 'Base MusicXML is not valid XML.' };
  }

  const resolver = doc.createNSResolver(doc.documentElement);
  const parseFragment = (value: string) => {
    const fragmentDoc = parser.parseFromString(`<wrapper>${value}</wrapper>`, 'application/xml');
    const fragmentError = fragmentDoc.querySelector?.('parsererror');
    if (fragmentError) {
      return { node: null as Node | null, error: 'Patch value is not valid XML.' };
    }
    const wrapper = fragmentDoc.documentElement;
    const elementChildren = Array.from(wrapper.childNodes).filter((node) => node.nodeType === bindings.Node.ELEMENT_NODE);
    const textChildren = Array.from(wrapper.childNodes).filter(
      (node) => node.nodeType === bindings.Node.TEXT_NODE && (node.textContent ?? '').trim(),
    );
    if (elementChildren.length !== 1 || textChildren.length > 0) {
      return { node: null, error: 'Patch value must contain exactly one element.' };
    }
    const imported = doc.importNode(elementChildren[0], true);
    return { node: imported, error: '' };
  };
  const resolveNodes = (path: string) => {
    try {
      const result = doc.evaluate(path, doc, resolver, bindings.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength < 1) {
        return { nodes: [] as Node[], error: `XPath "${path}" matched 0 nodes.` };
      }
      const nodes: Node[] = [];
      for (let i = 0; i < result.snapshotLength; i += 1) {
        const node = result.snapshotItem(i);
        if (node) {
          nodes.push(node);
        }
      }
      return { nodes, error: '' };
    } catch {
      return { nodes: [] as Node[], error: `XPath "${path}" could not be evaluated.` };
    }
  };

  const tryEnsureSetTextTarget = (path: string) => {
    // Allow conservative auto-creation for common MusicXML attribute edits
    // (e.g. setting clef/key/time in a measure that does not yet have <attributes>).
    if (!path.includes('/attributes/')) {
      return { nodes: [] as Node[], created: false };
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      return { nodes: [] as Node[], created: false };
    }
    for (let prefixLength = segments.length - 1; prefixLength >= 1; prefixLength -= 1) {
      const prefixPath = `/${segments.slice(0, prefixLength).join('/')}`;
      const prefixResult = resolveNodes(prefixPath);
      if (prefixResult.error || prefixResult.nodes.length !== 1) {
        continue;
      }
      const rootNode = prefixResult.nodes[0];
      if (
        rootNode.nodeType !== bindings.Node.ELEMENT_NODE
        && rootNode.nodeType !== bindings.Node.DOCUMENT_NODE
      ) {
        continue;
      }

      const missingSegments = segments.slice(prefixLength);
      if (missingSegments.length === 0) {
        continue;
      }
      // We only create plain element names (no predicates/index expressions).
      if (!missingSegments.every((segment) => /^[A-Za-z_][\w.-]*$/.test(segment))) {
        continue;
      }

      let current: Node = rootNode;
      for (const segment of missingSegments) {
        const nextNode = doc.createElement(segment);
        if (
          current.nodeType === bindings.Node.ELEMENT_NODE
          && (current as Element).tagName === 'measure'
          && segment === 'attributes'
        ) {
          const firstElementChild = Array.from(current.childNodes).find(
            (child) => child.nodeType === bindings.Node.ELEMENT_NODE,
          );
          if (firstElementChild) {
            current.insertBefore(nextNode, firstElementChild);
          } else {
            current.appendChild(nextNode);
          }
        } else {
          current.appendChild(nextNode);
        }
        current = nextNode;
      }
      return { nodes: [current], created: true };
    }
    return { nodes: [] as Node[], created: false };
  };

  for (let i = 0; i < patch.ops.length; i += 1) {
    const op = patch.ops[i];
    let { nodes, error } = resolveNodes(op.path);
    if ((error || nodes.length === 0) && op.op === 'setText') {
      const ensured = tryEnsureSetTextTarget(op.path);
      if (ensured.created) {
        nodes = ensured.nodes;
        error = '';
      }
    }
    if (op.op === 'delete' && nodes.length === 0 && !error) {
      continue;
    }
    if (error || nodes.length === 0) {
      return { xml: '', error: `Patch op ${i + 1} failed: ${error || 'Target not found.'}` };
    }
    if (op.op === 'setText') {
      for (const node of nodes) {
        node.textContent = op.value ?? '';
      }
      continue;
    }
    if (op.op === 'setAttr') {
      for (const node of nodes) {
        if (node.nodeType !== bindings.Node.ELEMENT_NODE) {
          return { xml: '', error: `Patch op ${i + 1} targets a non-element node.` };
        }
        (node as Element).setAttribute(op.name ?? '', op.value ?? '');
      }
      continue;
    }
    if (op.op === 'delete') {
      for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
        const node = nodes[nodeIndex];
        if (!node.parentNode) {
          continue;
        }
        node.parentNode.removeChild(node);
      }
      continue;
    }
    if (nodes.length !== 1) {
      return { xml: '', error: `Patch op ${i + 1} failed: XPath "${op.path}" matched ${nodes.length} nodes.` };
    }
    const node = nodes[0];
    const fragment = parseFragment(op.value ?? '');
    if (fragment.error || !fragment.node) {
      return { xml: '', error: `Patch op ${i + 1} failed: ${fragment.error || 'Invalid value.'}` };
    }
    if (!node.parentNode) {
      return { xml: '', error: `Patch op ${i + 1} target has no parent.` };
    }
    if (op.op === 'replace') {
      node.parentNode.replaceChild(fragment.node, node);
      continue;
    }
    if (op.op === 'insertBefore') {
      node.parentNode.insertBefore(fragment.node, node);
      continue;
    }
    if (op.op === 'insertAfter') {
      node.parentNode.insertBefore(fragment.node, node.nextSibling);
      continue;
    }
  }

  const serializer = new bindings.XMLSerializer();
  return { xml: serializer.serializeToString(doc), error: '' };
}

type RequestPatchTextArgs = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  promptText: string;
  maxTokens: number | null;
};

async function requestAiPatchTextWithRetry(args: RequestPatchTextArgs) {
  const requestPatchAttempt = async (attemptLabel: string) => {
    try {
      return await requestAiTextDirect({
        provider: args.provider,
        apiKey: args.apiKey,
        model: args.model,
        promptText: args.promptText,
        systemPrompt: AI_PATCH_SYSTEM_PROMPT,
        maxTokens: args.maxTokens,
      });
    } catch (error) {
      const message = errorMessage(error).toLowerCase();
      const shouldRetryRequest = !(
        message.includes('missing api')
        || message.includes('invalid api')
        || message.includes('unauthorized')
        || message.includes('forbidden')
      );
      if (!shouldRetryRequest) {
        throw error;
      }
      console.warn('[patch-service] Patch request failed; retrying once.', {
        provider: args.provider,
        model: args.model,
        attempt: attemptLabel,
        error: message || String(error),
      });
      await sleep(AI_PATCH_REQUEST_RETRY_DELAY_MS);
      return requestAiTextDirect({
        provider: args.provider,
        apiKey: args.apiKey,
        model: args.model,
        promptText: args.promptText,
        systemPrompt: AI_PATCH_SYSTEM_PROMPT,
        maxTokens: args.maxTokens,
      });
    }
  };

  const firstRawText = await requestPatchAttempt('initial');
  const firstExtracted = extractJsonFromResponse(firstRawText);
  const firstParsed = firstExtracted ? parseMusicXmlPatch(firstExtracted) : { patch: null, error: 'missing' };
  if (firstExtracted && !firstParsed.error && firstParsed.patch) {
    return {
      rawText: firstRawText,
      extracted: firstExtracted,
      retried: false,
    };
  }

  const retryHint = firstParsed.error && firstParsed.error !== 'missing'
    ? [
      'PREVIOUS PATCH ERROR:',
      firstParsed.error,
      'Fix the patch structure and return valid JSON only.',
    ].join('\n')
    : '';
  const retryPromptText = [args.promptText.trim(), retryHint, AI_PATCH_STRICT_RETRY_SUFFIX]
    .filter(Boolean)
    .join('\n\n');
  const retryRawText = await requestAiTextDirect({
    provider: args.provider,
    apiKey: args.apiKey,
    model: args.model,
    promptText: retryPromptText,
    systemPrompt: AI_PATCH_SYSTEM_PROMPT,
    maxTokens: args.maxTokens,
  });
  const retryExtracted = extractJsonFromResponse(retryRawText);
  return {
    rawText: retryRawText,
    extracted: retryExtracted,
    retried: true,
  };
}

export async function runMusicPatchService(
  body: unknown,
  _options?: { traceContext?: TraceContext },
): Promise<PatchServiceResult> {
  const data = asRecord(body);
  const prompt = typeof data?.prompt === 'string' ? data.prompt.trim() : '';
  const promptText = typeof data?.promptText === 'string' ? data.promptText.trim() : '';
  const provider = resolveProvider(data?.provider);
  const model = typeof data?.model === 'string' && data.model.trim()
    ? data.model.trim()
    : (DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL_BY_PROVIDER.openai);
  const maxTokensValue = Number(data?.maxTokens ?? data?.max_tokens);
  const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;
  const dryRun = Boolean(data?.dryRun || data?.dry_run);
  const apiKeyInput = (typeof data?.apiKey === 'string' ? data.apiKey : (typeof data?.api_key === 'string' ? data.api_key : '')).trim();

  if (!prompt && !promptText) {
    return {
      status: 400,
      body: { error: 'Missing prompt for music patch generation.' },
    };
  }

  if (dryRun) {
    return {
      status: 200,
      body: {
        ready: false,
        message: 'Dry run only. Provide dryRun=false to execute.',
        request: {
          provider,
          model,
          hasPrompt: Boolean(prompt || promptText),
          maxTokens,
        },
      },
    };
  }

  const resolution = await resolveScoreContent(body);
  if (resolution.error) {
    return resolution.error as PatchServiceResult;
  }

  const { xml, artifact: resolutionArtifact, session } = resolution;
  const apiKey = resolveApiKeyForProvider(provider, apiKeyInput);
  if (!apiKey) {
    const providerLabel = provider === 'openai'
      ? 'OpenAI'
      : provider.charAt(0).toUpperCase() + provider.slice(1);
    return {
      status: 400,
      body: { error: `Missing ${providerLabel} API key for music patch generation.` },
    };
  }

  try {
    const builtPromptText = promptText || buildAiPatchPrompt(prompt, xml);
    const patchResponse = await requestAiPatchTextWithRetry({
      provider,
      apiKey,
      model,
      promptText: builtPromptText,
      maxTokens,
    });
    if (!patchResponse.extracted) {
      return {
        status: 422,
        body: {
          error: 'Model response is not a musicxml-patch@1 payload.',
          retried: patchResponse.retried,
          text: patchResponse.rawText,
        },
      };
    }

    const parsed = parseMusicXmlPatch(patchResponse.extracted);
    if (parsed.error || !parsed.patch) {
      return {
        status: 422,
        body: {
          error: parsed.error || 'Model response is not a musicxml-patch@1 payload.',
          retried: patchResponse.retried,
          text: patchResponse.extracted,
        },
      };
    }

    return {
      status: 200,
      body: {
        mode: provider === 'openai' || OPENAI_COMPATIBLE_PROVIDER_SET.has(provider)
          ? 'openai-responses'
          : `${provider}-direct`,
        provider,
        model,
        scoreSessionId: session?.scoreSessionId ?? null,
        revision: session?.revision ?? null,
        inputArtifactId: resolutionArtifact?.id || null,
        inputArtifact: resolutionArtifact ? summarizeScoreArtifact(resolutionArtifact) : null,
        patch: parsed.patch,
        text: patchResponse.extracted,
        rawText: patchResponse.rawText,
        retried: patchResponse.retried,
      },
    };
  } catch (error) {
    console.error('[patch-service] Request failed:', error);
    return {
      status: 502,
      body: { error: errorMessage(error) || 'Internal patch service error.' },
    };
  }
}
