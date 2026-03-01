import {
    createScoreArtifact,
    summarizeScoreArtifact,
} from '../score-artifacts';
import { convertMusicNotation } from '../music-conversion';
import {
    asRecord,
    readBoolean,
    resolveScoreContent,
} from './common';

type ContextServiceResult = {
    status: number;
    body: Record<string, unknown>;
};

type MeasureSnippet = {
    partId: string;
    measureNumber: string;
    xml: string;
    truncated: boolean;
};

type SearchHit = {
    query: string;
    start: number;
    end: number;
    snippet: string;
};

const DEFAULT_MAX_CHARS = 20_000;
const MAX_MAX_CHARS = 500_000;
const DEFAULT_MEASURE_LIMIT = 32;
const MAX_MEASURE_LIMIT = 256;
const DEFAULT_SEARCH_LIMIT = 12;
const MAX_SEARCH_LIMIT = 200;
const DEFAULT_SNIPPET_CHARS = 500;
const MAX_SNIPPET_CHARS = 4_000;
const DEFAULT_MEASURE_SNIPPET_CHARS = 2_000;
const MAX_MEASURE_SNIPPET_CHARS = 20_000;

function readBoundedNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
    integer = true,
) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    const maybeInt = integer ? Math.trunc(parsed) : parsed;
    if (maybeInt < min) {
        return min;
    }
    if (maybeInt > max) {
        return max;
    }
    return maybeInt;
}

function maybeReadMeasure(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.max(0, Math.trunc(parsed));
}

function truncateText(text: string, maxChars: number) {
    if (text.length <= maxChars) {
        return { text, truncated: false };
    }
    return {
        text: `${text.slice(0, maxChars)}\n<!-- ...truncated... -->`,
        truncated: true,
    };
}

function extractPartList(xml: string) {
    const match = xml.match(/<part-list\b[\s\S]*?<\/part-list>/i);
    return match ? match[0].trim() : '';
}

function extractMeasuresInRange(
    xml: string,
    rangeStart: number | null,
    rangeEnd: number | null,
    maxMeasures: number,
    maxCharsPerMeasure: number,
): MeasureSnippet[] {
    const parts: MeasureSnippet[] = [];
    const partRegex = /<part\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/part>/gi;
    let partMatch: RegExpExecArray | null;
    let collected = 0;

    while ((partMatch = partRegex.exec(xml)) !== null && collected < maxMeasures) {
        const partId = partMatch[1] || '';
        const partXml = partMatch[2] || '';
        const measureRegex = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/gi;
        let measureMatch: RegExpExecArray | null;
        while ((measureMatch = measureRegex.exec(partXml)) !== null && collected < maxMeasures) {
            const attrs = measureMatch[1] || '';
            const fullXml = measureMatch[0] || '';
            const numMatch = attrs.match(/\bnumber="([^"]+)"/i);
            const measureNumber = numMatch?.[1] ?? '';
            const numericMeasure = Number.parseInt(measureNumber, 10);
            if (rangeStart !== null && (!Number.isFinite(numericMeasure) || numericMeasure < rangeStart)) {
                continue;
            }
            if (rangeEnd !== null && (!Number.isFinite(numericMeasure) || numericMeasure > rangeEnd)) {
                continue;
            }
            const truncated = truncateText(fullXml.trim(), maxCharsPerMeasure);
            parts.push({
                partId,
                measureNumber,
                xml: truncated.text,
                truncated: truncated.truncated,
            });
            collected += 1;
        }
    }

    return parts;
}

function ensureStringArray(value: unknown): string[] {
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
}

function extractSearchHits(
    xml: string,
    queries: string[],
    maxResults: number,
    snippetChars: number,
): SearchHit[] {
    if (!queries.length || maxResults <= 0) {
        return [];
    }
    const hits: SearchHit[] = [];
    const lowerXml = xml.toLowerCase();
    for (const query of queries) {
        if (hits.length >= maxResults) {
            break;
        }
        const needle = query.toLowerCase();
        if (!needle) {
            continue;
        }
        let index = 0;
        while (hits.length < maxResults) {
            const found = lowerXml.indexOf(needle, index);
            if (found < 0) {
                break;
            }
            const start = Math.max(0, found - snippetChars);
            const end = Math.min(xml.length, found + needle.length + snippetChars);
            hits.push({
                query,
                start: found,
                end: found + needle.length,
                snippet: xml.slice(start, end),
            });
            index = found + Math.max(1, needle.length);
        }
    }
    return hits;
}

/**
 * Computes a high-signal "analytical fingerprint" of the score content.
 * This is designed to survive summarization and provide the model with 
 * the essential musical facts needed for harmonic analysis.
 */
function computeAnalyticalFingerprint(xml: string) {
    // 1. Key Signatures (Initial and Changes)
    const keyMatches = [...xml.matchAll(/<fifths>([-]?\d+)<\/fifths>(?:\s*<mode>(.*?)<\/mode>)?/gi)];
    const keys = keyMatches.map(m => ({ 
        fifths: parseInt(m[1], 10), 
        mode: m[2] || 'major' 
    }));

    // 2. Time Signatures
    const timeMatches = [...xml.matchAll(/<beats>(\d+)<\/beats>\s*<beat-type>(\d+)<\/beat-type>/gi)];
    const timeSignatures = timeMatches.map(m => `${m[1]}/${m[2]}`);

    // 3. Note Distribution (Chromagram-ish)
    // Simple regex to find step + alter combinations
    const noteRegex = /<step>([A-G])<\/step>(?:\s*<alter>([-]?\d+)<\/alter>)?/gi;
    const histogram: Record<string, number> = {};
    let totalNotes = 0;
    
    let match;
    while ((match = noteRegex.exec(xml)) !== null) {
        const step = match[1];
        const alter = match[2] ? parseInt(match[2], 10) : 0;
        const noteName = alter === 0 ? step : (alter > 0 ? `${step}#` : `${step}b`);
        histogram[noteName] = (histogram[noteName] || 0) + 1;
        totalNotes++;
    }

    // 4. Structural hints
    const measureCount = (xml.match(/<measure\b/gi) || []).length;
    const parts = [...xml.matchAll(/<score-part id="([^"]+)">\s*<part-name>(.*?)<\/part-name>/gi)]
        .map(m => ({ id: m[1], name: m[2] }));

    return {
        initialKey: keys[0] || null,
        keyChanges: keys.slice(1),
        initialTimeSignature: timeSignatures[0] || null,
        noteHistogram: histogram,
        totalNotes,
        measureCount,
        parts
    };
}

export async function runMusicContextService(body: unknown): Promise<ContextServiceResult> {
    const data = asRecord(body);
    const resolution = await resolveScoreContent(body);
    if (resolution.error) {
        return resolution.error as ContextServiceResult;
    }

    const { xml, artifact: resolutionArtifact, session } = resolution;
    const filename = typeof data?.filename === 'string' ? data.filename : undefined;
    const persistArtifact = readBoolean(data?.persistArtifact, data?.persist_artifact, false);

    let inputArtifact = resolutionArtifact;
    if (persistArtifact && !inputArtifact) {
        inputArtifact = await createScoreArtifact({
            format: 'musicxml',
            content: xml,
            filename,
            label: 'context-input',
            metadata: {
                origin: 'api/music/context',
            },
        });
    }

    const includeFullXml = readBoolean(data?.includeFullXml, data?.include_full_xml, false);
    const includeAbc = readBoolean(data?.includeAbc, data?.include_abc, false);
    const includeFingerprint = readBoolean(data?.includeFingerprint, data?.include_fingerprint, true);
    const includePartList = readBoolean(data?.includePartList, data?.include_part_list, true);
    const includeMeasureRange = readBoolean(data?.includeMeasureRange, data?.include_measure_range, true);
    const includeSearchHits = readBoolean(data?.includeSearchHits, data?.include_search_hits, true);

    const maxChars = readBoundedNumber(
        data?.maxChars ?? data?.max_chars,
        DEFAULT_MAX_CHARS,
        1,
        MAX_MAX_CHARS,
    );
    const maxMeasures = readBoundedNumber(
        data?.maxMeasures ?? data?.max_measures,
        DEFAULT_MEASURE_LIMIT,
        1,
        MAX_MEASURE_LIMIT,
    );
    const maxSearchResults = readBoundedNumber(
        data?.maxSearchResults ?? data?.max_search_results,
        DEFAULT_SEARCH_LIMIT,
        1,
        MAX_SEARCH_LIMIT,
    );
    const snippetChars = readBoundedNumber(
        data?.snippetChars ?? data?.snippet_chars,
        DEFAULT_SNIPPET_CHARS,
        50,
        MAX_SNIPPET_CHARS,
    );
    const measureSnippetChars = readBoundedNumber(
        data?.maxMeasureXmlChars ?? data?.max_measure_xml_chars,
        DEFAULT_MEASURE_SNIPPET_CHARS,
        200,
        MAX_MEASURE_SNIPPET_CHARS,
    );

    const measureStart = maybeReadMeasure(data?.measureStart ?? data?.measure_start);
    const measureEnd = maybeReadMeasure(data?.measureEnd ?? data?.measure_end);

    const partList = includePartList ? extractPartList(xml) : '';
    const queries = ensureStringArray(data?.queries ?? data?.query);
    const measureSnippets = includeMeasureRange
        ? extractMeasuresInRange(xml, measureStart, measureEnd, maxMeasures, measureSnippetChars)
        : [];
    const searchHits = includeSearchHits
        ? extractSearchHits(xml, queries, maxSearchResults, snippetChars)
        : [];
    const fullXml = includeFullXml ? truncateText(xml, maxChars) : null;
    const partListOutput = partList ? truncateText(partList, maxChars) : null;
    const fingerprint = includeFingerprint ? computeAnalyticalFingerprint(xml) : null;

    let abcOutput: { text: string; truncated: boolean } | null = null;
    if (includeAbc) {
        try {
            const conversion = await convertMusicNotation({
                inputFormat: 'musicxml',
                outputFormat: 'abc',
                content: xml,
            });
            const truncated = truncateText(conversion.content, maxChars);
            abcOutput = {
                text: truncated.text,
                truncated: truncated.truncated,
            };
        } catch (err) {
            console.error('[context-service] ABC conversion failed:', err);
            // Non-fatal, just omit ABC from output
        }
    }

    return {
        status: 200,
        body: {
            strategy: 'musicxml-primary',
            scoreSessionId: session?.scoreSessionId ?? null,
            revision: session?.revision ?? null,
            inputArtifactId: inputArtifact?.id ?? null,
            inputArtifact: inputArtifact ? summarizeScoreArtifact(inputArtifact) : null,
            context: {
                format: 'musicxml',
                charLength: xml.length,
                lineCount: xml.split(/\r?\n/).length,
                abc: abcOutput,
                fingerprint,
                measureCountEstimate: (xml.match(/<measure\b/gi) || []).length,
                queryCount: queries.length,
                measureRange: {
                    start: measureStart,
                    end: measureEnd,
                    results: measureSnippets,
                    limitedTo: maxMeasures,
                },
                searchHits: {
                    results: searchHits,
                    limitedTo: maxSearchResults,
                },
                partList: partListOutput ? {
                    xml: partListOutput.text,
                    truncated: partListOutput.truncated,
                } : null,
                fullXml: fullXml ? {
                    xml: fullXml.text,
                    truncated: fullXml.truncated,
                } : null,
            },
        },
    };
}
