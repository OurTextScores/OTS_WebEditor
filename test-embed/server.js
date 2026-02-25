/**
 * Simple static file server for testing the embedded score editor.
 * Serves:
 * - /score-editor/* -> ../out/*
 * - /* -> test-embed/*
 * Also provides Anthropic proxy routes used by embed mode:
 * - /api/llm/anthropic
 * - /api/llm/anthropic/models
 * - /api/llm/gemini
 * - /api/llm/gemini/models
 * - /api/llm/grok
 * - /api/llm/grok/models
 * - /api/llm/deepseek
 * - /api/llm/deepseek/models
 * - /api/llm/kimi
 * - /api/llm/kimi/models
 * Also supports same-origin embed proxy aliases:
 * - /api/score-editor/llm/*  -> local /api/llm/* test proxies
 * - /api/score-editor/music/* -> proxied to TEST_EMBED_EDITOR_API_ORIGIN (if configured)
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2048;
const TEST_EMBED_EDITOR_API_ORIGIN = (process.env.TEST_EMBED_EDITOR_API_ORIGIN || '').replace(/\/+$/, '');
const OPENAI_COMPATIBLE_LLMS = {
  grok: {
    label: 'Grok',
    baseUrl: process.env.LLM_GROK_API_BASE_URL || 'https://api.x.ai/v1',
    supportsPdf: false,
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: process.env.LLM_DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com/v1',
    supportsPdf: false,
  },
  kimi: {
    label: 'Kimi',
    baseUrl: process.env.LLM_KIMI_API_BASE_URL || 'https://api.moonshot.ai/v1',
    supportsPdf: false,
  },
};

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.mscz': 'application/octet-stream',
  '.xml': 'text/xml',
  '.musicxml': 'text/xml',
  '.mxl': 'application/vnd.recordare.musicxml',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.pdf': 'application/pdf',
  '.wav': 'audio/wav',
  '.sf2': 'application/octet-stream',
  '.sf3': 'application/octet-stream',
};

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    if (!raw.trim()) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(raw));
    } catch (error) {
      reject(error);
    }
  });
  req.on('error', reject);
});

const readRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const parseAnthropicText = (data) => {
  const content = Array.isArray(data?.content) ? data.content : [];
  return content
    .map((part) => (part?.type === 'text' ? part?.text || '' : ''))
    .join('');
};

const parseGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((part) => part?.text || '').join('') : '';
};

const parseOpenAiCompatibleChatText = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || '').join('');
  }
  return '';
};

const normalizeGeminiModel = (model) => {
  const trimmed = String(model || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('/')) {
    return trimmed;
  }
  return `models/${trimmed}`;
};

const handleAnthropicModels = async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    if (!apiKey) {
      sendJson(res, 400, { error: 'Missing apiKey.' });
      return;
    }

    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || 'Anthropic request failed.' });
      return;
    }

    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((item) => item?.id).filter((id) => typeof id === 'string')
      : Array.isArray(data?.data)
        ? data.data.map((item) => item?.id).filter((id) => typeof id === 'string')
        : [];
    sendJson(res, 200, { models });
  } catch (err) {
    console.error('Anthropic models proxy error', err);
    sendJson(res, 500, { error: 'Anthropic models proxy error.' });
  }
};

const handleAnthropicRequest = async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    const model = String(body?.model || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const promptText = typeof body?.promptText === 'string' ? body.promptText.trim() : '';
    const systemPromptInput = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const imageMediaType = typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
    const pdfMediaType = typeof body?.pdfMediaType === 'string' ? body.pdfMediaType.trim() : 'application/pdf';
    const maxTokensRaw = body?.maxTokens;
    const maxTokensValue = Number(maxTokensRaw);
    const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : DEFAULT_MAX_TOKENS;

    if (!apiKey || !model || (!promptText && !prompt)) {
      sendJson(res, 400, { error: 'Missing apiKey, model, or prompt/promptText.' });
      return;
    }

    const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
    const userPrompt = promptText || prompt;
    const userContent = [{ type: 'text', text: userPrompt }];

    if (imageBase64) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: imageBase64,
        },
      });
    }
    if (pdfBase64) {
      userContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: pdfMediaType,
          data: pdfBase64,
        },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || 'Anthropic request failed.' });
      return;
    }

    const data = await response.json();
    sendJson(res, 200, { text: parseAnthropicText(data) });
  } catch (err) {
    console.error('Anthropic proxy error', err);
    sendJson(res, 500, { error: 'Anthropic proxy error.' });
  }
};

const handleGeminiModels = async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    if (!apiKey) {
      sendJson(res, 400, { error: 'Missing apiKey.' });
      return;
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || 'Gemini request failed.' });
      return;
    }

    const data = await response.json();
    const rawModels = Array.isArray(data?.models) ? data.models : [];
    const ids = [];
    for (const item of rawModels) {
      if (typeof item?.baseModelId === 'string') {
        ids.push(item.baseModelId);
      }
      if (typeof item?.name === 'string') {
        ids.push(String(item.name).replace(/^models\//, ''));
      }
    }
    sendJson(res, 200, { models: ids.filter((id) => typeof id === 'string') });
  } catch (err) {
    console.error('Gemini models proxy error', err);
    sendJson(res, 500, { error: 'Gemini models proxy error.' });
  }
};

const handleGeminiRequest = async (req, res) => {
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    const model = String(body?.model || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const promptText = typeof body?.promptText === 'string' ? body.promptText.trim() : '';
    const systemPromptInput = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
    const xml = typeof body?.xml === 'string' ? body.xml : '';
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const imageMediaType = typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
    const pdfMediaType = typeof body?.pdfMediaType === 'string' ? body.pdfMediaType.trim() : 'application/pdf';
    const maxTokensRaw = body?.maxTokens;
    const maxTokensValue = Number(maxTokensRaw);
    const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;

    if (!apiKey || !model || (!promptText && !prompt)) {
      sendJson(res, 400, { error: 'Missing apiKey, model, or prompt/promptText.' });
      return;
    }

    const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
    const userPrompt = promptText || prompt || xml;
    const normalizedModel = normalizeGeminiModel(model);
    if (!normalizedModel) {
      sendJson(res, 400, { error: 'Missing model.' });
      return;
    }

    const parts = [{ text: userPrompt }];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMediaType,
          data: imageBase64,
        },
      });
    }
    if (pdfBase64) {
      parts.push({
        inlineData: {
          mimeType: pdfMediaType,
          data: pdfBase64,
        },
      });
    }

    const generationConfig = {
      temperature: 0,
      ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${normalizedModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || 'Gemini request failed.' });
      return;
    }

    const data = await response.json();
    sendJson(res, 200, { text: parseGeminiText(data) });
  } catch (err) {
    console.error('Gemini proxy error', err);
    sendJson(res, 500, { error: 'Gemini proxy error.' });
  }
};

const handleOpenAiCompatibleModels = async (req, res, provider) => {
  const config = OPENAI_COMPATIBLE_LLMS[provider];
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    if (!apiKey) {
      sendJson(res, 400, { error: 'Missing apiKey.' });
      return;
    }

    const response = await fetch(`${String(config.baseUrl).replace(/\/+$/, '')}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || `${config.label} request failed.` });
      return;
    }

    const data = await response.json();
    const models = Array.isArray(data?.data)
      ? data.data.map((item) => item?.id).filter((id) => typeof id === 'string')
      : Array.isArray(data?.models)
        ? data.models.map((item) => (typeof item === 'string' ? item : item?.id)).filter((id) => typeof id === 'string')
        : [];
    sendJson(res, 200, { models });
  } catch (err) {
    console.error(`${config.label} models proxy error`, err);
    sendJson(res, 500, { error: `${config.label} models proxy error.` });
  }
};

const handleOpenAiCompatibleRequest = async (req, res, provider) => {
  const config = OPENAI_COMPATIBLE_LLMS[provider];
  const baseUrl = String(config.baseUrl).replace(/\/+$/, '');
  try {
    const body = await readJsonBody(req);
    const apiKey = String(body?.apiKey || '').trim();
    const model = String(body?.model || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const promptText = typeof body?.promptText === 'string' ? body.promptText.trim() : '';
    const systemPromptInput = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const imageMediaType = typeof body?.imageMediaType === 'string' ? body.imageMediaType.trim() : 'image/png';
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
    const maxTokensRaw = body?.maxTokens;
    const maxTokensValue = Number(maxTokensRaw);
    const maxTokens = Number.isFinite(maxTokensValue) && maxTokensValue > 0 ? maxTokensValue : null;

    if (!apiKey || !model || (!promptText && !prompt)) {
      sendJson(res, 400, { error: 'Missing apiKey, model, or prompt/promptText.' });
      return;
    }
    if (pdfBase64 && !config.supportsPdf) {
      sendJson(res, 400, { error: `${config.label} proxy does not support PDF attachments yet.` });
      return;
    }

    const systemPrompt = systemPromptInput || 'You are a MusicXML editor. Return only a JSON patch payload (musicxml-patch@1), no markdown or commentary.';
    const userPrompt = promptText || prompt;
    const userMessageContent = imageBase64
      ? [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${imageMediaType};base64,${imageBase64}`,
          },
        },
      ]
      : userPrompt;

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessageContent },
      ],
      temperature: 0,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendJson(res, response.status, { error: errorText || `${config.label} request failed.` });
      return;
    }

    const data = await response.json();
    sendJson(res, 200, { text: parseOpenAiCompatibleChatText(data) });
  } catch (err) {
    console.error(`${config.label} proxy error`, err);
    sendJson(res, 500, { error: `${config.label} proxy error.` });
  }
};

const tryHandleLlmProxy = async (req, res, pathname) => {
  if (!pathname.startsWith('/api/llm/')) {
    return false;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, jsonHeaders);
    res.end();
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (pathname === '/api/llm/anthropic/models') {
    await handleAnthropicModels(req, res);
    return true;
  }

  if (pathname === '/api/llm/anthropic') {
    await handleAnthropicRequest(req, res);
    return true;
  }

  if (pathname === '/api/llm/gemini/models') {
    await handleGeminiModels(req, res);
    return true;
  }

  if (pathname === '/api/llm/gemini') {
    await handleGeminiRequest(req, res);
    return true;
  }

  if (pathname === '/api/llm/grok/models') {
    await handleOpenAiCompatibleModels(req, res, 'grok');
    return true;
  }

  if (pathname === '/api/llm/grok') {
    await handleOpenAiCompatibleRequest(req, res, 'grok');
    return true;
  }

  if (pathname === '/api/llm/deepseek/models') {
    await handleOpenAiCompatibleModels(req, res, 'deepseek');
    return true;
  }

  if (pathname === '/api/llm/deepseek') {
    await handleOpenAiCompatibleRequest(req, res, 'deepseek');
    return true;
  }

  if (pathname === '/api/llm/kimi/models') {
    await handleOpenAiCompatibleModels(req, res, 'kimi');
    return true;
  }

  if (pathname === '/api/llm/kimi') {
    await handleOpenAiCompatibleRequest(req, res, 'kimi');
    return true;
  }

  // OpenAI is intentionally not proxied here; the client falls back to direct browser calls.
  sendJson(res, 404, { error: `No test proxy route for ${pathname}` });
  return true;
};

const proxyToEditorApiOrigin = async (req, res, targetUrl) => {
  try {
    const method = req.method || 'GET';
    const shouldSendBody = !['GET', 'HEAD'].includes(method);
    const rawBody = shouldSendBody ? await readRawBody(req) : null;
    const headers = {};
    if (req.headers['content-type']) {
      headers['content-type'] = req.headers['content-type'];
    }
    if (req.headers.accept) {
      headers.accept = req.headers.accept;
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: rawBody && rawBody.length ? rawBody : undefined,
    });

    const responseBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const responseHeaders = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(response.status, responseHeaders);
    res.end(responseBuffer);
  } catch (err) {
    console.error('Score editor API proxy error', err);
    sendJson(res, 502, { error: 'Score editor API proxy error.' });
  }
};

const tryHandleScoreEditorApiProxy = async (req, res, requestUrl, pathname) => {
  if (!pathname.startsWith('/api/score-editor/')) {
    return false;
  }

  if (pathname === '/api/score-editor/music/__proxy-health') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
      return true;
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return true;
    }
    if (!TEST_EMBED_EDITOR_API_ORIGIN) {
      sendJson(res, 200, {
        ok: false,
        configured: false,
        origin: null,
        message: 'TEST_EMBED_EDITOR_API_ORIGIN is not set.',
      });
      return true;
    }
    const targetUrl = `${TEST_EMBED_EDITOR_API_ORIGIN}/api/music/convert`;
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ health_check: true }),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      sendJson(res, response.ok ? 200 : 502, {
        ok: response.ok,
        configured: true,
        origin: TEST_EMBED_EDITOR_API_ORIGIN,
        targetUrl,
        upstreamStatus: response.status,
        upstreamMethod: 'POST',
        upstreamJson: parsed,
        upstreamTextPreview: typeof text === 'string' ? text.slice(0, 500) : '',
      });
    } catch (err) {
      sendJson(res, 502, {
        ok: false,
        configured: true,
        origin: TEST_EMBED_EDITOR_API_ORIGIN,
        targetUrl,
        error: err instanceof Error ? err.message : 'Unknown proxy health error.',
      });
    }
    return true;
  }

  if (pathname.startsWith('/api/score-editor/llm/')) {
    const localLlmPath = `/api${pathname.slice('/api/score-editor'.length)}`;
    return tryHandleLlmProxy(req, res, localLlmPath);
  }

  if (pathname.startsWith('/api/score-editor/music/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...jsonHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return true;
    }
    if (!TEST_EMBED_EDITOR_API_ORIGIN) {
      sendJson(res, 501, {
        error: 'No test music proxy configured. Set TEST_EMBED_EDITOR_API_ORIGIN (e.g. http://localhost:3000) to forward /api/score-editor/music/*.',
      });
      return true;
    }
    const upstreamPath = `/api${pathname.slice('/api/score-editor'.length)}${requestUrl.search || ''}`;
    await proxyToEditorApiOrigin(req, res, `${TEST_EMBED_EDITOR_API_ORIGIN}${upstreamPath}`);
    return true;
  }

  sendJson(res, 404, { error: `No test proxy route for ${pathname}` });
  return true;
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = requestUrl.pathname;

  if (await tryHandleScoreEditorApiProxy(req, res, requestUrl, pathname)) {
    return;
  }

  if (await tryHandleLlmProxy(req, res, pathname)) {
    return;
  }

  let filePath;

  // Route /score-editor/* to out/*
  if (pathname.startsWith('/score-editor/')) {
    filePath = path.join(__dirname, '..', 'out', pathname.substring('/score-editor/'.length));
  } else if (pathname === '/') {
    // Root -> index.html
    filePath = path.join(__dirname, 'index.html');
  } else {
    // Everything else -> test-embed/
    filePath = path.join(__dirname, pathname);
  }

  // Default to index.html for directories
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Get file extension and MIME type
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Read and serve file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${pathname}`, 'utf-8');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Test server running at http://localhost:${PORT}/`);
  console.log('\nServing:');
  console.log(`  - http://localhost:${PORT}/               -> test-embed/index.html`);
  console.log(`  - http://localhost:${PORT}/score-editor/  -> out/ (embedded build)`);
  console.log(`  - http://localhost:${PORT}/api/llm/anthropic* -> local Anthropic proxy`);
  console.log(`  - http://localhost:${PORT}/api/llm/gemini* -> local Gemini proxy`);
  console.log(`  - http://localhost:${PORT}/api/llm/grok* -> local Grok proxy`);
  console.log(`  - http://localhost:${PORT}/api/llm/deepseek* -> local DeepSeek proxy`);
  console.log(`  - http://localhost:${PORT}/api/llm/kimi* -> local Kimi proxy`);
  console.log(`  - http://localhost:${PORT}/api/score-editor/llm* -> alias to local LLM proxies`);
  console.log(`  - http://localhost:${PORT}/api/score-editor/music* -> proxy via TEST_EMBED_EDITOR_API_ORIGIN${TEST_EMBED_EDITOR_API_ORIGIN ? ` (${TEST_EMBED_EDITOR_API_ORIGIN})` : ' (not configured)'}`);
  console.log(`  - http://localhost:${PORT}/api/score-editor/music/__proxy-health -> test proxy health check`);
  console.log('\nPress Ctrl+C to stop\n');
});
