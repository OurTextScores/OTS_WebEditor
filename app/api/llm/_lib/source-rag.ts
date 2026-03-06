import { sanitizeEditorLaunchContext, type EditorLaunchContext } from '../../../../lib/editor-launch-context';

type SourceRagInput = {
    sourceContext?: unknown;
    enableSourceRag?: unknown;
    promptText?: string;
    prompt?: string;
};

type SourceRagEvidence = {
    id: string;
    label: string;
    url: string;
    tier: 'authority' | 'catalog' | 'archive' | 'reference' | 'scholarly' | 'source';
    score: number;
    snippets: string[];
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
        sourceCount?: number;
        sources?: Array<{
            id: string;
            label: string;
            url: string;
            tier: string;
            score: number;
        }>;
    };
};

type CachedValue = {
    expiresAt: number;
    value: unknown;
};

type RetrievalIntent = 'overview' | 'source_history' | 'analysis' | 'metadata';

type WikipediaSearchResponse = {
    query?: {
        search?: Array<{
            title?: string;
            snippet?: string;
        }>;
    };
};

type WikipediaSummaryResponse = {
    title?: string;
    extract?: string;
    content_urls?: {
        desktop?: {
            page?: string;
        };
    };
};

type WikidataSearchResponse = {
    search?: Array<{
        id?: string;
        label?: string;
        description?: string;
        concepturi?: string;
    }>;
};

type RismSearchResponse = {
    items?: Array<{
        id?: string;
        label?: Record<string, string[]>;
        summary?: Record<string, { value?: Record<string, string[]> }>;
        flags?: {
            hasDigitization?: boolean;
        };
    }>;
};

type OpenAlexResponse = {
    results?: Array<{
        id?: string;
        title?: string;
        display_name?: string;
        relevance_score?: number;
        publication_year?: number;
        primary_topic?: {
            display_name?: string;
            subfield?: { display_name?: string };
            field?: { display_name?: string };
            domain?: { display_name?: string };
        };
        primary_location?: {
            landing_page_url?: string | null;
            source?: {
                display_name?: string;
                is_oa?: boolean;
                is_in_doaj?: boolean;
            };
        };
        best_oa_location?: {
            landing_page_url?: string | null;
            pdf_url?: string | null;
            source?: {
                display_name?: string;
                is_oa?: boolean;
                is_in_doaj?: boolean;
            };
        };
        abstract_inverted_index?: Record<string, number[]>;
    }>;
};

type LibraryOfCongressResponse = {
    results?: Array<{
        id?: string;
        title?: string;
        description?: string | string[];
        item?: {
            title?: string;
            created_published?: string;
        };
        contributor?: string[];
        subject?: string[];
        partof?: string[];
        url?: string;
    }>;
};

type MusicBrainzWorkResponse = {
    works?: Array<{
        id?: string;
        title?: string;
        disambiguation?: string;
        'first-release-date'?: string;
        type?: string;
        score?: number;
        relations?: Array<{
            type?: string;
            artist?: {
                name?: string;
            };
        }>;
        'artist-credit'?: Array<{
            name?: string;
            artist?: {
                name?: string;
            };
        }>;
    }>;
};

type MusicBrainzArtistResponse = {
    artists?: Array<{
        id?: string;
        name?: string;
        disambiguation?: string;
        country?: string;
        'life-span'?: {
            begin?: string;
            end?: string;
        };
        score?: number;
    }>;
};

const cache = (globalThis as any).__otsSourceRagCache || new Map<string, CachedValue>();
(globalThis as any).__otsSourceRagCache = cache;

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_CHARS = 120_000;
const MAX_SNIPPETS_PER_SOURCE = 2;
const MAX_TOTAL_EVIDENCE = 5;
const USER_AGENT = 'OurTextScores-ScoreEditor/1.0 (+source-rag)';
const STOPWORDS = new Set([
    'about', 'after', 'again', 'also', 'among', 'because', 'before', 'being', 'between',
    'could', 'first', 'from', 'into', 'latest', 'message', 'music', 'score', 'their',
    'there', 'these', 'this', 'those', 'through', 'under', 'using', 'which', 'would',
    'with', 'what', 'when', 'where', 'while', 'your', 'have', 'just', 'than', 'that',
    'them', 'then', 'they', 'were', 'will', 'shall', 'onto', 'over', 'page', 'wiki',
    'imslp', 'work', 'piece', 'question', 'editor', 'chat',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

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
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTagsPreservingText(html: string) {
    return stripHtml(html).slice(0, 1200);
}

function normalizeSourceContext(sourceContext: unknown) {
    return sanitizeEditorLaunchContext(sourceContext);
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

function dedupeStrings(values: string[]) {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed) {
            continue;
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        next.push(trimmed);
    }
    return next;
}

function extractRelevantSnippets(text: string, queryText: string, maxSnippets = MAX_SNIPPETS_PER_SOURCE) {
    const lowered = text.toLowerCase();
    const tokens = tokenizeQuery(queryText);
    const snippets: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
        let index = 0;
        while (snippets.length < maxSnippets) {
            const found = lowered.indexOf(token, index);
            if (found < 0) {
                break;
            }
            const start = Math.max(0, found - 220);
            const end = Math.min(text.length, found + token.length + 220);
            const snippet = text.slice(start, end).trim();
            const normalized = snippet.toLowerCase();
            if (snippet.length >= 40 && !seen.has(normalized)) {
                snippets.push(snippet);
                seen.add(normalized);
            }
            index = found + token.length;
        }
        if (snippets.length >= maxSnippets) {
            break;
        }
    }

    if (!snippets.length && text.trim()) {
        snippets.push(text.slice(0, Math.min(text.length, 420)).trim());
    }
    return snippets.slice(0, maxSnippets);
}

function normalizeImslpTitleFromUrl(url: string) {
    try {
        const parsed = new URL(url);
        const rawTitle = parsed.pathname.split('/').pop() || '';
        return decodeURIComponent(rawTitle)
            .replace(/_/g, ' ')
            .replace(/^wiki\//i, '')
            .trim();
    } catch {
        return '';
    }
}

function extractTitleFromHtml(html: string) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    return stripHtml(title).slice(0, 300);
}

function inferIntent(promptText: string): RetrievalIntent {
    const text = promptText.toLowerCase();
    if (/(manuscript|autograph|source history|provenance|holding|library|archive|copyist|edition|edition history|siglum)/.test(text)) {
        return 'source_history';
    }
    if (/(harmony|analysis|analyze|roman numeral|cadence|modulation|form|theory)/.test(text)) {
        return 'analysis';
    }
    if (/(catalog|catalogue|opus|bwv|kv|k\.|hob|date|instrumentation|identifier|metadata)/.test(text)) {
        return 'metadata';
    }
    return 'overview';
}

function buildQueryParts(sourceContext: EditorLaunchContext | null, promptText: string) {
    const parts = dedupeStrings([
        sourceContext?.workTitle || '',
        sourceContext?.composer || '',
        normalizeImslpTitleFromUrl(sourceContext?.imslpUrl || ''),
    ]);
    const composed = parts.join(' ').trim();
    const fallback = promptText.trim();
    return {
        entityQuery: composed || fallback,
        workQuery: sourceContext?.workTitle || normalizeImslpTitleFromUrl(sourceContext?.imslpUrl || '') || fallback,
        composerQuery: sourceContext?.composer || '',
    };
}

function cacheKey(prefix: string, value: string) {
    return `${prefix}:${value}`;
}

async function fetchCachedJson<T>(url: string, key: string): Promise<T> {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.value as T;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, application/ld+json;q=0.9, text/plain;q=0.2, */*;q=0.1',
                'User-Agent': USER_AGENT,
                'Api-User-Agent': USER_AGENT,
            },
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!response.ok) {
            throw new Error(`fetch failed with ${response.status}`);
        }
        const data = await response.json() as T;
        cache.set(key, {
            expiresAt: now + CACHE_TTL_MS,
            value: data,
        });
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchCachedText(url: string, key: string, accept = 'text/html, text/plain;q=0.9, */*;q=0.1'): Promise<string> {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        return String(cached.value || '');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': accept,
                'User-Agent': USER_AGENT,
                'Api-User-Agent': USER_AGENT,
            },
            signal: controller.signal,
            cache: 'no-store',
        });
        if (!response.ok) {
            throw new Error(`fetch failed with ${response.status}`);
        }
        const text = await response.text();
        cache.set(key, {
            expiresAt: now + CACHE_TTL_MS,
            value: text,
        });
        return text;
    } finally {
        clearTimeout(timeout);
    }
}

function labelFromLocalizedField(value: Record<string, string[]> | undefined) {
    if (!value) {
        return '';
    }
    const candidates = [value.none, value.en, value.de, value.fr];
    for (const entry of candidates) {
        if (Array.isArray(entry) && entry[0]) {
            return entry[0];
        }
    }
    return '';
}

function firstSummaryValue(summary: Record<string, { value?: Record<string, string[]> }> | undefined, field: string) {
    const value = summary?.[field]?.value;
    if (!value) {
        return '';
    }
    return labelFromLocalizedField(value);
}

function buildAbstractFromInvertedIndex(index: Record<string, number[]> | undefined) {
    if (!index) {
        return '';
    }
    const tokens: Array<[number, string]> = [];
    Object.entries(index).forEach(([word, positions]) => {
        positions.forEach((position) => tokens.push([position, word]));
    });
    return tokens
        .sort((a, b) => a[0] - b[0])
        .map(([, word]) => word)
        .join(' ')
        .trim();
}

function scoreEvidence(args: {
    tier: SourceRagEvidence['tier'];
    intent: RetrievalIntent;
    text: string;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
    sourceBoost?: number;
}) {
    let score = 0;
    if (args.tier === 'authority') score += 100;
    if (args.tier === 'catalog') score += 99;
    if (args.tier === 'archive') score += 97;
    if (args.tier === 'source') score += 92;
    if (args.tier === 'reference') score += 82;
    if (args.tier === 'scholarly') score += 78;

    if (args.intent === 'source_history' && args.tier === 'archive') score += 22;
    if (args.intent === 'source_history' && args.tier === 'source') score += 18;
    if (args.intent === 'source_history' && args.tier === 'authority') score += 10;
    if (args.intent === 'source_history' && args.tier === 'catalog') score += 8;
    if (args.intent === 'analysis' && args.tier === 'scholarly') score += 16;
    if (args.intent === 'overview' && args.tier === 'reference') score += 12;
    if (args.intent === 'metadata' && args.tier === 'authority') score += 16;
    if (args.intent === 'metadata' && args.tier === 'catalog') score += 14;

    const haystack = args.text.toLowerCase();
    for (const token of tokenizeQuery(args.entityQuery)) {
        if (haystack.includes(token)) {
            score += 2;
        }
    }
    if (args.composerQuery && haystack.includes(args.composerQuery.toLowerCase())) {
        score += 8;
    }
    if (args.workQuery && haystack.includes(args.workQuery.toLowerCase())) {
        score += 8;
    }
    if (args.sourceBoost) {
        score += args.sourceBoost;
    }
    return score;
}

async function fetchImslpEvidence(args: {
    sourceContext: EditorLaunchContext;
    queryText: string;
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    if (!args.sourceContext.imslpUrl) {
        return null;
    }
    const html = await fetchCachedText(args.sourceContext.imslpUrl, cacheKey('imslp', args.sourceContext.imslpUrl));
    const title = extractTitleFromHtml(html);
    const text = stripHtml(html).slice(0, MAX_HTML_CHARS);
    const snippets = extractRelevantSnippets(text, args.queryText);
    if (!snippets.length) {
        return null;
    }
    const label = args.sourceContext.workTitle || title || normalizeImslpTitleFromUrl(args.sourceContext.imslpUrl) || 'IMSLP';
    return {
        id: 'imslp',
        label,
        url: args.sourceContext.imslpUrl,
        tier: 'source',
        score: scoreEvidence({
            tier: 'source',
            intent: args.intent,
            text: `${label} ${title} ${text.slice(0, 2000)}`,
            entityQuery: args.entityQuery,
            composerQuery: args.composerQuery,
            workQuery: args.workQuery,
            sourceBoost: 6,
        }),
        snippets,
    };
}

async function fetchWikipediaEvidence(args: {
    queryText: string;
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(args.entityQuery)}`;
    const search = await fetchCachedJson<WikipediaSearchResponse>(searchUrl, cacheKey('wikipedia-search', args.entityQuery));
    const first = search.query?.search?.[0];
    const title = first?.title?.trim();
    if (!title) {
        return null;
    }
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    let summary: WikipediaSummaryResponse | null = null;
    try {
        summary = await fetchCachedJson<WikipediaSummaryResponse>(summaryUrl, cacheKey('wikipedia-summary', title));
    } catch {
        summary = null;
    }
    const snippetSource = [
        summary?.extract || '',
        stripTagsPreservingText(first?.snippet || ''),
    ].filter(Boolean).join(' ');
    const snippets = extractRelevantSnippets(snippetSource, args.queryText);
    if (!snippets.length) {
        return null;
    }
    const pageUrl = summary?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return {
        id: 'wikipedia',
        label: summary?.title || title,
        url: pageUrl,
        tier: 'reference',
        score: scoreEvidence({
            tier: 'reference',
            intent: args.intent,
            text: `${title} ${snippetSource}`,
            entityQuery: args.entityQuery,
            composerQuery: args.composerQuery,
            workQuery: args.workQuery,
            sourceBoost: 8,
        }),
        snippets,
    };
}

async function fetchWikidataEvidence(args: {
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const candidates = dedupeStrings([
        args.workQuery && args.composerQuery ? `${args.workQuery} ${args.composerQuery}` : '',
        args.workQuery,
        args.composerQuery,
        args.entityQuery,
    ]).slice(0, 3);

    for (const candidate of candidates) {
        const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=3&search=${encodeURIComponent(candidate)}`;
        const response = await fetchCachedJson<WikidataSearchResponse>(url, cacheKey('wikidata-search', candidate));
        const first = response.search?.find((item) => item.id && (item.label || item.description));
        if (!first?.id) {
            continue;
        }
        const snippetText = [first.label, first.description].filter(Boolean).join(' - ');
        const snippets = extractRelevantSnippets(snippetText, candidate || args.entityQuery, 1);
        if (!snippets.length) {
            continue;
        }
        return {
            id: 'wikidata',
            label: first.label || first.id,
            url: first.concepturi || `https://www.wikidata.org/wiki/${first.id}`,
            tier: 'authority',
            score: scoreEvidence({
                tier: 'authority',
                intent: args.intent,
                text: snippetText,
                entityQuery: args.entityQuery,
                composerQuery: args.composerQuery,
                workQuery: args.workQuery,
                sourceBoost: 12,
            }),
            snippets,
        };
    }
    return null;
}

async function fetchRismEvidence(args: {
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const query = dedupeStrings([
        args.workQuery && args.composerQuery ? `${args.workQuery} ${args.composerQuery}` : '',
        args.workQuery,
        args.entityQuery,
    ])[0];
    if (!query) {
        return null;
    }
    const url = `https://rism.online/search?q=${encodeURIComponent(query)}&rows=20&mode=sources`;
    const response = await fetchCachedJson<RismSearchResponse>(url, cacheKey('rism-search', query));
    const items = Array.isArray(response.items) ? response.items : [];
    const ranked = items.map((item) => {
        const label = labelFromLocalizedField(item.label) || 'RISM source';
        const composer = firstSummaryValue(item.summary, 'sourceComposer') || firstSummaryValue(item.summary, 'sourceComposers');
        const dates = firstSummaryValue(item.summary, 'dateStatements');
        const contentType = firstSummaryValue(item.summary, 'materialContentTypes');
        const sourceType = firstSummaryValue(item.summary, 'materialSourceTypes');
        const snippetText = [label, composer, sourceType, contentType, dates].filter(Boolean).join(' | ');
        return {
            item,
            label,
            snippetText,
            score: scoreEvidence({
                tier: 'archive',
                intent: args.intent,
                text: snippetText,
                entityQuery: args.entityQuery,
                composerQuery: args.composerQuery,
                workQuery: args.workQuery,
                sourceBoost: item.flags?.hasDigitization ? 16 : 8,
            }),
        };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best?.item?.id) {
        return null;
    }
    return {
            id: 'rism',
            label: best.label,
            url: best.item.id,
            tier: 'archive',
            score: best.score,
            snippets: extractRelevantSnippets(best.snippetText, query, 1),
        };
}

function isLikelyMusicScholarlyResult(item: NonNullable<OpenAlexResponse['results']>[number], entityQuery: string, composerQuery: string, workQuery: string) {
    const primaryTopic = item.primary_topic?.display_name || '';
    const subfield = item.primary_topic?.subfield?.display_name || '';
    const sourceName = item.primary_location?.source?.display_name || item.best_oa_location?.source?.display_name || '';
    const text = `${item.title || ''} ${item.display_name || ''} ${primaryTopic} ${subfield} ${sourceName}`.toLowerCase();
    if (/music theory online|musicology|musical analysis|music/.test(text)) {
        return true;
    }
    if (composerQuery && text.includes(composerQuery.toLowerCase())) {
        return true;
    }
    if (workQuery && text.includes(workQuery.toLowerCase())) {
        return true;
    }
    return tokenizeQuery(entityQuery).some((token) => text.includes(token));
}

async function fetchOpenAlexEvidence(args: {
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const query = dedupeStrings([
        args.workQuery && args.composerQuery ? `${args.workQuery} ${args.composerQuery}` : '',
        args.entityQuery,
    ])[0];
    if (!query) {
        return null;
    }
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5&filter=is_oa:true`;
    const response = await fetchCachedJson<OpenAlexResponse>(url, cacheKey('openalex-search', query));
    const items = (response.results || [])
        .filter((item) => isLikelyMusicScholarlyResult(item, args.entityQuery, args.composerQuery, args.workQuery))
        .map((item) => {
            const sourceName = item.primary_location?.source?.display_name || item.best_oa_location?.source?.display_name || 'OpenAlex';
            const abstract = buildAbstractFromInvertedIndex(item.abstract_inverted_index);
            const snippetText = [
                item.display_name || item.title || '',
                sourceName,
                item.primary_topic?.display_name || '',
                item.primary_topic?.subfield?.display_name || '',
                abstract,
            ].filter(Boolean).join(' | ');
            const url = item.best_oa_location?.landing_page_url
                || item.primary_location?.landing_page_url
                || item.id
                || 'https://api.openalex.org';
            return {
                label: `${item.display_name || item.title || 'OpenAlex result'} (${sourceName})`,
                url,
                snippetText,
                score: scoreEvidence({
                    tier: 'scholarly',
                    intent: args.intent,
                    text: snippetText,
                    entityQuery: args.entityQuery,
                    composerQuery: args.composerQuery,
                    workQuery: args.workQuery,
                    sourceBoost: /music theory online/i.test(sourceName) ? 12 : 0,
                }) + (item.relevance_score || 0),
            };
        })
        .sort((a, b) => b.score - a.score);

    const best = items[0];
    if (!best) {
        return null;
    }
    return {
        id: 'openalex',
        label: best.label,
        url: best.url,
        tier: 'scholarly',
        score: best.score,
        snippets: extractRelevantSnippets(best.snippetText, query, 1),
    };
}

async function fetchLibraryOfCongressEvidence(args: {
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const query = dedupeStrings([
        args.workQuery && args.composerQuery ? `${args.workQuery} ${args.composerQuery}` : '',
        args.entityQuery,
        args.workQuery,
    ])[0];
    if (!query) {
        return null;
    }
    const url = `https://www.loc.gov/search/?fo=json&q=${encodeURIComponent(query)}`;
    const response = await fetchCachedJson<LibraryOfCongressResponse>(url, cacheKey('loc-search', query));
    const results = Array.isArray(response.results) ? response.results : [];
    const ranked = results
        .map((item) => {
            const label = item.title || item.item?.title || 'Library of Congress result';
            const snippetText = [
                label,
                Array.isArray(item.description) ? item.description.join(' | ') : (item.description || ''),
                item.item?.created_published || '',
                Array.isArray(item.contributor) ? item.contributor.join(' | ') : '',
                Array.isArray(item.partof) ? item.partof.join(' | ') : '',
                Array.isArray(item.subject) ? item.subject.join(' | ') : '',
            ].filter(Boolean).join(' | ');
            const resultUrl = item.url || item.id || '';
            return {
                label,
                url: resultUrl,
                snippetText,
                score: scoreEvidence({
                    tier: 'archive',
                    intent: args.intent,
                    text: snippetText,
                    entityQuery: args.entityQuery,
                    composerQuery: args.composerQuery,
                    workQuery: args.workQuery,
                    sourceBoost: 2,
                }),
            };
        })
        .filter((item) => item.url)
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best) {
        return null;
    }

    return {
        id: 'loc',
        label: `${best.label} (Library of Congress)`,
        url: best.url,
        tier: 'archive',
        score: best.score,
        snippets: extractRelevantSnippets(best.snippetText, query, 1),
    };
}

function extractMusicBrainzComposer(item: NonNullable<MusicBrainzWorkResponse['works']>[number]) {
    const credit = Array.isArray(item['artist-credit']) ? item['artist-credit'] : [];
    const names = credit
        .map((entry) => entry.artist?.name || entry.name || '')
        .filter(Boolean);
    return dedupeStrings(names).join(', ');
}

async function fetchMusicBrainzEvidence(args: {
    intent: RetrievalIntent;
    entityQuery: string;
    composerQuery: string;
    workQuery: string;
}): Promise<SourceRagEvidence | null> {
    const workQuery = dedupeStrings([
        args.workQuery && args.composerQuery ? `work:${args.workQuery} AND artist:${args.composerQuery}` : '',
        args.workQuery ? `work:${args.workQuery}` : '',
    ])[0];

    if (workQuery) {
        const workUrl = `https://musicbrainz.org/ws/2/work/?query=${encodeURIComponent(workQuery)}&fmt=json&limit=3`;
        const workResponse = await fetchCachedJson<MusicBrainzWorkResponse>(workUrl, cacheKey('musicbrainz-work', workQuery));
        const works = Array.isArray(workResponse.works) ? workResponse.works : [];
        const rankedWorks = works
            .map((item) => {
                const composer = extractMusicBrainzComposer(item);
                const snippetText = [
                    item.title || '',
                    composer,
                    item.disambiguation || '',
                    item.type || '',
                    item['first-release-date'] || '',
                ].filter(Boolean).join(' | ');
                return {
                    id: item.id || '',
                    label: item.title || 'MusicBrainz work',
                    snippetText,
                    score: scoreEvidence({
                        tier: 'catalog',
                        intent: args.intent,
                        text: snippetText,
                        entityQuery: args.entityQuery,
                        composerQuery: args.composerQuery,
                        workQuery: args.workQuery,
                        sourceBoost: typeof item.score === 'number' ? item.score / 10 : 8,
                    }),
                };
            })
            .filter((item) => item.id)
            .sort((a, b) => b.score - a.score);

        const bestWork = rankedWorks[0];
        if (bestWork) {
            return {
                id: 'musicbrainz',
                label: `${bestWork.label} (MusicBrainz)`,
                url: `https://musicbrainz.org/work/${bestWork.id}`,
                tier: 'catalog',
                score: bestWork.score,
                snippets: extractRelevantSnippets(bestWork.snippetText, args.entityQuery, 1),
            };
        }
    }

    if (!args.composerQuery) {
        return null;
    }
    const artistUrl = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(args.composerQuery)}&fmt=json&limit=3`;
    const artistResponse = await fetchCachedJson<MusicBrainzArtistResponse>(artistUrl, cacheKey('musicbrainz-artist', args.composerQuery));
    const artists = Array.isArray(artistResponse.artists) ? artistResponse.artists : [];
    const rankedArtists = artists
        .map((item) => {
            const snippetText = [
                item.name || '',
                item.disambiguation || '',
                item.country || '',
                item['life-span']?.begin || '',
                item['life-span']?.end || '',
            ].filter(Boolean).join(' | ');
            return {
                id: item.id || '',
                label: item.name || 'MusicBrainz artist',
                snippetText,
                score: scoreEvidence({
                    tier: 'catalog',
                    intent: args.intent,
                    text: snippetText,
                    entityQuery: args.entityQuery,
                    composerQuery: args.composerQuery,
                    workQuery: args.workQuery,
                    sourceBoost: typeof item.score === 'number' ? item.score / 10 : 6,
                }),
            };
        })
        .filter((item) => item.id)
        .sort((a, b) => b.score - a.score);

    const bestArtist = rankedArtists[0];
    if (!bestArtist) {
        return null;
    }
    return {
        id: 'musicbrainz',
        label: `${bestArtist.label} (MusicBrainz)`,
        url: `https://musicbrainz.org/artist/${bestArtist.id}`,
        tier: 'catalog',
        score: bestArtist.score,
        snippets: extractRelevantSnippets(bestArtist.snippetText, args.composerQuery, 1),
    };
}

function chooseEvidenceSet(evidence: SourceRagEvidence[]) {
    const sorted = [...evidence].sort((a, b) => b.score - a.score);
    const picked: SourceRagEvidence[] = [];
    const usedIds = new Set<string>();
    const bestByTier = new Map<string, SourceRagEvidence>();

    for (const item of sorted) {
        const existing = bestByTier.get(item.tier);
        if (!existing || item.score > existing.score) {
            bestByTier.set(item.tier, item);
        }
    }

    for (const item of Array.from(bestByTier.values()).sort((a, b) => b.score - a.score)) {
        if (picked.length >= MAX_TOTAL_EVIDENCE) {
            break;
        }
        picked.push(item);
        usedIds.add(item.id);
    }

    for (const item of sorted) {
        if (picked.length >= MAX_TOTAL_EVIDENCE) {
            break;
        }
        if (usedIds.has(item.id)) {
            continue;
        }
        picked.push(item);
        usedIds.add(item.id);
    }

    return picked.slice(0, MAX_TOTAL_EVIDENCE);
}

function buildRagSection(args: {
    evidence: SourceRagEvidence[];
    sourceContext: EditorLaunchContext | null;
    intent: RetrievalIntent;
}) {
    const lines = [
        'External Source Context (ranked retrieval)',
        `Retrieval intent: ${args.intent}`,
    ];
    if (args.sourceContext?.workTitle) {
        lines.push(`Work: ${args.sourceContext.workTitle}`);
    }
    if (args.sourceContext?.composer) {
        lines.push(`Composer: ${args.sourceContext.composer}`);
    }
    if (args.sourceContext?.imslpUrl) {
        lines.push(`Launch source URL: ${args.sourceContext.imslpUrl}`);
    }
    lines.push('Use these as supporting external sources. Prefer higher-tier evidence when sources disagree, and say when evidence is mixed or indirect.');
    args.evidence.forEach((item, index) => {
        lines.push(``);
        lines.push(`Source ${index + 1}: ${item.label}`);
        lines.push(`Tier: ${item.tier}`);
        lines.push(`URL: ${item.url}`);
        item.snippets.forEach((snippet, snippetIndex) => {
            lines.push(`Snippet ${snippetIndex + 1}: ${snippet}`);
        });
    });
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

    const hasContext = Boolean(sourceContext?.workTitle || sourceContext?.composer || sourceContext?.imslpUrl);
    if (!hasContext) {
        return {
            promptText,
            sourceContext,
            sourceRag: {
                enabled: true,
                used: false,
                reason: 'missing_source_context',
            },
        };
    }

    const intent = inferIntent(promptText);
    const queries = buildQueryParts(sourceContext, promptText);

    try {
        const settled = await Promise.allSettled([
            fetchImslpEvidence({
                sourceContext: sourceContext as EditorLaunchContext,
                queryText: promptText || queries.entityQuery,
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchWikipediaEvidence({
                queryText: promptText || queries.entityQuery,
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchWikidataEvidence({
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchRismEvidence({
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchOpenAlexEvidence({
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchLibraryOfCongressEvidence({
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
            fetchMusicBrainzEvidence({
                intent,
                entityQuery: queries.entityQuery,
                composerQuery: queries.composerQuery,
                workQuery: queries.workQuery,
            }),
        ]);

        const evidence = settled
            .filter((entry): entry is PromiseFulfilledResult<SourceRagEvidence | null> => entry.status === 'fulfilled')
            .map((entry) => entry.value)
            .filter((entry): entry is SourceRagEvidence => Boolean(entry && entry.snippets.length));

        const selected = chooseEvidenceSet(evidence);
        if (!selected.length) {
            return {
                promptText,
                sourceContext,
                sourceRag: {
                    enabled: true,
                    used: false,
                    reason: 'no_relevant_sources',
                    sourceUrl: sourceContext?.imslpUrl,
                },
            };
        }

        const ragSection = buildRagSection({
            evidence: selected,
            sourceContext,
            intent,
        });

        return {
            promptText: `${promptText}\n\n${ragSection}`.trim(),
            sourceContext,
            sourceRag: {
                enabled: true,
                used: true,
                reason: undefined,
                sourceUrl: sourceContext?.imslpUrl,
                sourceCount: selected.length,
                snippetCount: selected.reduce((sum, item) => sum + item.snippets.length, 0),
                sources: selected.map((item) => ({
                    id: item.id,
                    label: item.label,
                    url: item.url,
                    tier: item.tier,
                    score: item.score,
                })),
            },
        };
    } catch (error) {
        return {
            promptText,
            sourceContext,
            sourceRag: {
                enabled: true,
                used: false,
                reason: error instanceof Error ? error.message : 'retrieval_failed',
                sourceUrl: sourceContext?.imslpUrl,
            },
        };
    }
}
