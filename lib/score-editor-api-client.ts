const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);

const SCORE_EDITOR_API_BASE = trimTrailingSlashes((process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE || '').trim());
const LEGACY_LLM_PROXY_BASE = trimTrailingSlashes((process.env.NEXT_PUBLIC_LLM_PROXY_URL || '').trim());

const normalizePathForEditorApiBase = (path: string) => {
    const normalized = ensureLeadingSlash(path);
    // `NEXT_PUBLIC_SCORE_EDITOR_API_BASE=/api/score-editor` should map:
    // `/api/llm/*`   -> `/api/score-editor/llm/*`
    // `/api/music/*` -> `/api/score-editor/music/*`
    return normalized.startsWith('/api/')
        ? normalized.slice('/api'.length)
        : normalized;
};

export const getScoreEditorApiBase = () => SCORE_EDITOR_API_BASE;

export const getLegacyLlmProxyBase = () => LEGACY_LLM_PROXY_BASE;

export const resolveScoreEditorApiPath = (path: string) => {
    if (SCORE_EDITOR_API_BASE) {
        return `${SCORE_EDITOR_API_BASE}${normalizePathForEditorApiBase(path)}`;
    }
    return ensureLeadingSlash(path);
};

export const resolveLlmApiPath = (path: string) => {
    if (SCORE_EDITOR_API_BASE) {
        return `${SCORE_EDITOR_API_BASE}${normalizePathForEditorApiBase(path)}`;
    }
    if (LEGACY_LLM_PROXY_BASE) {
        return `${LEGACY_LLM_PROXY_BASE}${ensureLeadingSlash(path)}`;
    }
    return ensureLeadingSlash(path);
};

