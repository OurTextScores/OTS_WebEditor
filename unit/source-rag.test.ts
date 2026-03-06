import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { augmentPromptWithSourceRag } from '../app/api/llm/_lib/source-rag';

describe('augmentPromptWithSourceRag', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the original prompt when source rag is disabled', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: false,
      promptText: 'Tell me about this source.',
      sourceContext: {
        workTitle: 'Prelude in C',
        composer: 'J. S. Bach',
        imslpUrl: 'https://imslp.org/wiki/Test_Work',
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.promptText).toBe('Tell me about this source.');
    expect(result.sourceRag).toMatchObject({
      enabled: false,
      used: false,
      reason: 'disabled',
    });
  });

  it('does not retrieve when source context is missing', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: true,
      promptText: 'Summarize the historical context.',
      sourceContext: {},
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.promptText).toBe('Summarize the historical context.');
    expect(result.sourceRag).toMatchObject({
      enabled: true,
      used: false,
      reason: 'missing_source_context',
    });
  });

  it('augments the prompt with ranked evidence from multiple sources', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://imslp.org/wiki/Test_Work')) {
        return new Response(`
          <html>
            <head><title>Prelude in C (Bach)</title></head>
            <body>
              <p>This IMSLP work page lists editions and source information for the Prelude in C major by J. S. Bach.</p>
              <p>The page discusses manuscripts, copies, and publication details.</p>
            </body>
          </html>
        `, { status: 200 });
      }
      if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
        return Response.json({
          query: {
            search: [
              {
                title: 'Prelude and Fugue in C major, BWV 846',
                snippet: 'The Prelude and Fugue in C major, BWV 846, is a keyboard composition written by Johann Sebastian Bach.',
              },
            ],
          },
        });
      }
      if (url.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/')) {
        return Response.json({
          title: 'Prelude and Fugue in C major, BWV 846',
          extract: 'The Prelude and Fugue in C major, BWV 846, opens The Well-Tempered Clavier and is one of Bach\'s best-known keyboard works.',
          content_urls: {
            desktop: {
              page: 'https://en.wikipedia.org/wiki/Prelude_and_Fugue_in_C_major,_BWV_846',
            },
          },
        });
      }
      if (url.startsWith('https://www.wikidata.org/w/api.php')) {
        return Response.json({
          search: [
            {
              id: 'Q123',
              label: 'Prelude and Fugue in C major, BWV 846',
              description: 'composition by Johann Sebastian Bach',
              concepturi: 'https://www.wikidata.org/wiki/Q123',
            },
          ],
        });
      }
      if (url.startsWith('https://rism.online/search?')) {
        return Response.json({
          items: [
            {
              id: 'https://rism.online/sources/1001102659',
              label: { en: ['Preludes and Fugues–C major; Manuscript copy; D-B Mus.ms. Bach P 296 (39)'] },
              summary: {
                sourceComposer: { value: { none: ['Bach, Johann Sebastian (1685-1750)'] } },
                dateStatements: { value: { none: ['1763'] } },
                materialSourceTypes: { value: { en: ['Manuscript copy'] } },
                materialContentTypes: { value: { en: ['Notated music'] } },
              },
              flags: { hasDigitization: true },
            },
          ],
        });
      }
      if (url.startsWith('https://api.openalex.org/works?')) {
        return Response.json({
          results: [
            {
              id: 'https://openalex.org/W1',
              display_name: 'Compositions, Scores, Performances, Meanings',
              relevance_score: 15,
              primary_topic: {
                display_name: 'Musicology and Musical Analysis',
                subfield: { display_name: 'Music' },
              },
              primary_location: {
                landing_page_url: 'https://doi.org/10.30535/mto.18.1.4',
                source: {
                  display_name: 'Music Theory Online',
                  is_oa: true,
                  is_in_doaj: true,
                },
              },
              abstract_inverted_index: {
                Bach: [0],
                prelude: [1],
                analysis: [2],
                meaning: [3],
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: true,
      promptText: 'Explain the source history and significance of this Bach prelude.',
      sourceContext: {
        workTitle: 'Prelude in C major, BWV 846',
        composer: 'J. S. Bach',
        imslpUrl: 'https://imslp.org/wiki/Test_Work',
      },
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.promptText).toContain('External Source Context (ranked retrieval)');
    expect(result.promptText).toContain('Source 1:');
    expect(result.promptText).toContain('https://imslp.org/wiki/Test_Work');
    expect(result.promptText).toContain('https://www.wikidata.org/wiki/Q123');
    expect(result.promptText).toContain('https://rism.online/sources/1001102659');
    expect(result.promptText).toContain('Music Theory Online');
    expect(result.sourceRag).toMatchObject({
      enabled: true,
      used: true,
      sourceCount: expect.any(Number),
      snippetCount: expect.any(Number),
    });
    expect(result.sourceRag.sourceCount).toBeGreaterThanOrEqual(3);
    expect(result.sourceRag.sources?.some((item) => item.id === 'wikidata')).toBe(true);
    expect(result.sourceRag.sources?.some((item) => item.id === 'rism')).toBe(true);
  });

  it('can include wikipedia evidence for overview prompts', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://en.wikipedia.org/w/api.php')) {
        return Response.json({
          query: {
            search: [
              {
                title: 'Johann Sebastian Bach',
                snippet: 'Johann Sebastian Bach was a German composer and musician of the late Baroque period.',
              },
            ],
          },
        });
      }
      if (url.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/')) {
        return Response.json({
          title: 'Johann Sebastian Bach',
          extract: 'Johann Sebastian Bach was a German composer and keyboardist of the late Baroque period.',
          content_urls: {
            desktop: {
              page: 'https://en.wikipedia.org/wiki/Johann_Sebastian_Bach',
            },
          },
        });
      }
      if (url.startsWith('https://www.wikidata.org/w/api.php')) {
        return Response.json({
          search: [
            {
              id: 'Q1339',
              label: 'Johann Sebastian Bach',
              description: 'German composer and musician',
              concepturi: 'https://www.wikidata.org/wiki/Q1339',
            },
          ],
        });
      }
      if (url.startsWith('https://api.openalex.org/works?')) {
        return Response.json({ results: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: true,
      promptText: 'Give me a brief overview of Bach.',
      sourceContext: {
        composer: 'Johann Sebastian Bach',
      },
    });

    expect(result.sourceRag.used).toBe(true);
    expect(result.sourceRag.sources?.some((item) => item.id === 'wikipedia')).toBe(true);
    expect(result.promptText).toContain('https://en.wikipedia.org/wiki/Johann_Sebastian_Bach');
  });
});
