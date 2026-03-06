import { sanitizeEditorLaunchContext, type EditorLaunchContext } from '../../../../lib/editor-launch-context';

type SourceRagInput = {
    sourceContext?: unknown;
    enableSourceRag?: unknown;
    promptText?: string;
    prompt?: string;
};

type SourceRagResult = {
    promptText: string;
    sourceContext: EditorLaunchContext | null;
    sourceRag: {
        enabled: boolean;
        used: boolean;
        reason?: string;
        sourceUrl?: string;
        snippetCount?: number;
    };
};

type CachedPage = {
    expiresAt: number;
    text: string;
    title: string;
};

const cache = (globalThis as any).__otsSourceRagCache || new Map<string, CachedPage>();
(globalThis as any).__otsSourceRagCache = cache;

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PAGE_CHARS = 120_000;
const MAX_SNIPPETS = 6;
const SNIPPET_WINDOW = 220;
const FETCH_TIMEOUT_MS = 6_000;
const STOPWORDS = new Set([
    'about', 'after', 'again', 'also', 'among', 'because', 'before', 'being', 'between',
    'could', 'first', 'from', 'into', 'latest', 'message', 'music', 'score', 'their',
    'there', 'these', 'this', 'those', 'through', 'under', 'using', 'which', 'would',
    'with', 'what', 'when', 'where', 'while', 'your', 'have', 'just', 'than', 'that',
    'them', 'then', 'they', 'were', 'will', 'shall', 'into', 'onto', 'over', 'page',
    'imslp', 'wiki',
]);

function stripHtml(html: string) {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTitle(html: string) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    return stripHtml(title).slice(0, 300);
}

function normalizeSourceContext(sourceContext: unknown) {
    return sanitizeEditorLaunchContext(sourceContext);
}

function isImslpUrl(value: string) {
    try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && /(^|\.)imslp\.org$/i.test(url.hostname);
    } catch {
        return false;
    }
}

function tokenizeQuery(text: string) {
    const counts = new Map<string, number>();
    for (const token of text.toLowerCase().match(/[a-z][a-z0-9#.'-]{2,}/g) || []) {
        if (STOPWORDS.has(token)) {
            continue;
        }
        counts.set(token, (counts.get(token) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 12)
        .map(([token]) => token);
}

function extractRelevantSnippets(text: string, queryText: string) {
    const lowered = text.toLowerCase();
    const tokens = tokenizeQuery(queryText);
    const snippets: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
        let index = 0;
        while (snippets.length < MAX_SNIPPETS) {
            const found = lowered.indexOf(token, index);
            if (found < 0) {
                break;
            }
            const start = Math.max(0, found - SNIPPET_WINDOW);
            const end = Math.min(text.length, found + token.length + SNIPPET_WINDOW);
            const snippet = text.slice(start, end).trim();
            const normalized = snippet.toLowerCase();
            if (snippet.length >= 40 && !seen.has(normalized)) {
                snippets.push(snippet);
                seen.add(normalized);
            }
            index = found + token.length;
        }
        if (snippets.length >= MAX_SNIPPETS) {
            break;
        }
    }

    if (!snippets.length && text.trim()) {
        snippets.push(text.slice(0, Math.min(text.length, 500)).trim());
    }
    return snippets.slice(0, MAX_SNIPPETS);
}

async function fetchImslpPage(url: string): Promise<{ text: string; title: string }> {
    const now = Date.now();
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now) {
        return { text: cached.text, title: cached.title };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'OurTextScores-ScoreEditor/1.0 (+source-rag)',
            },
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!response.ok) {
            throw new Error(`IMSLP fetch failed with ${response.status}`);
        }
        const html = await response.text();
        const title = extractTitle(html);
        const text = stripHtml(html).slice(0, MAX_PAGE_CHARS);
        cache.set(url, {
            expiresAt: now + CACHE_TTL_MS,
            text,
            title,
        });
        return { text, title };
    } finally {
        clearTimeout(timeout);
    }
}

function buildRagSection(args: {
    sourceContext: EditorLaunchContext;
    title: string;
    snippets: string[];
}) {
    const lines = [
        'External Source Context (IMSLP)',
        `Source URL: ${args.sourceContext.imslpUrl}`,
    ];
    if (args.sourceContext.workTitle) {
        lines.push(`Work: ${args.sourceContext.workTitle}`);
    }
    if (args.sourceContext.composer) {
        lines.push(`Composer: ${args.sourceContext.composer}`);
    }
    if (args.title) {
        lines.push(`Retrieved page title: ${args.title}`);
    }
    lines.push('Relevant IMSLP page snippets:');
    args.snippets.forEach((snippet, index) => {
        lines.push(`${index + 1}. ${snippet}`);
    });
    lines.push('Use this as supporting retrieval context. If it conflicts with the score or is ambiguous, say so.');
    return lines.join('\n');
}

export async function augmentPromptWithSourceRag(input: SourceRagInput): Promise<SourceRagResult> {
    const sourceContext = normalizeSourceContext(input.sourceContext);
    const enableSourceRag = input.enableSourceRag === true;
    const promptText = typeof input.promptText === 'string' && input.promptText.trim()
        ? input.promptText.trim()
        : (typeof input.prompt === 'string' ? input.prompt.trim() : '');

    if (!enableSourceRag) {
        return {
            promptText,
            sourceContext,
            sourceRag: {
                enabled: false,
                used: false,
                reason: 'disabled',
            },
        };
    }
    if (!sourceContext?.imslpUrl || !isImslpUrl(sourceContext.imslpUrl)) {
        return {
            promptText,
            sourceContext,
            sourceRag: {
                enabled: true,
                used: false,
                reason: 'invalid_or_missing_imslp_url',
            },
        };
    }

    try {
        const page = await fetchImslpPage(sourceContext.imslpUrl);
        const snippets = extractRelevantSnippets(page.text, promptText || `${sourceContext.workTitle || ''} ${sourceContext.composer || ''}`);
        if (!snippets.length) {
            return {
                promptText,
                sourceContext,
                sourceRag: {
                    enabled: true,
                    used: false,
                    reason: 'no_relevant_snippets',
                    sourceUrl: sourceContext.imslpUrl,
                },
            };
        }

        const ragSection = buildRagSection({
            sourceContext,
            title: page.title,
            snippets,
        });

        return {
            promptText: `${promptText}\n\n${ragSection}`.trim(),
            sourceContext,
            sourceRag: {
                enabled: true,
                used: true,
                sourceUrl: sourceContext.imslpUrl,
                snippetCount: snippets.length,
            },
        };
    } catch (error) {
        return {
            promptText,
            sourceContext,
            sourceRag: {
                enabled: true,
                used: false,
                reason: error instanceof Error ? error.message : 'fetch_failed',
                sourceUrl: sourceContext.imslpUrl,
            },
        };
    }
}
