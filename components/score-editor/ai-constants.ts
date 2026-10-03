export const PROXY_MISSING_STATUSES = new Set([404, 405, 501]);

export const AI_CHAT_SOURCE_RAG_HINT_DISMISSED_STORAGE_KEY =
  'ots_ai_chat_source_rag_hint_dismissed';

export const ANTHROPIC_EMBED_PROXY_ERROR = [
  'Claude requires an LLM proxy in embed mode because browser-direct Anthropic calls are blocked by CORS.',
  'Configure NEXT_PUBLIC_SCORE_EDITOR_API_BASE (recommended) or NEXT_PUBLIC_LLM_PROXY_URL, or serve /api/llm/anthropic on the same origin.',
].join(' ');

export const AI_PAGE_SVG_CONTEXT_MAX_CHARS = 180_000;

export const AI_SELECTION_CONTEXT_MAX_CHARS = 40_000;

export const AI_SELECTION_BOX_CONTEXT_LIMIT = 24;

export const AI_PDF_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

export const AI_CHAT_CONTEXT_MAX_CHARS = 40_000;

export const AI_CHAT_CONTEXT_MAX_MESSAGES = 24;

export const AI_PATCH_SYSTEM_PROMPT =
  'You are a MusicXML editor. Return only a single JSON object (musicxml-patch@1) — the patch and an optional "annotations" array. No markdown or prose outside the JSON.';

export const AI_DIFF_GUTTER_DEFAULT_WIDTH = 360;

export const AI_DIFF_GUTTER_MIN_WIDTH = 360;

export const AI_DIFF_GUTTER_MAX_WIDTH = 1280;

export const AI_DIFF_COMMENT_GUTTER_PADDING = 72;

export const AI_CHAT_SYSTEM_PROMPT =
  'You are a helpful music notation assistant. Answer clearly and practically for score editing and engraving workflows.';

export const MMA_BLUES_DEMO_TEMPLATE = `Tempo 110\nTimeSig 4 4\nKeySig C\nGroove Swing\n\n1  C7\n2  F7\n3  C7\n4  C7\n5  F7\n6  F7\n7  C7\n8  C7\n9  G7\n10  F7\n11  C7\n12  G7\n`;

export const MMA_TEMPLATE_MAX_MEASURES = 2500;

export const isMissingProxyStatus = (status: number) => PROXY_MISSING_STATUSES.has(status);
