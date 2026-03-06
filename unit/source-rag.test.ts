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
    const result = await augmentPromptWithSourceRag({
      enableSourceRag: false,
      promptText: 'Tell me about this source.',
      sourceContext: {
        imslpUrl: 'https://imslp.org/wiki/Test_Work',
      },
    });

    expect(result.promptText).toBe('Tell me about this source.');
    expect(result.sourceRag).toMatchObject({
      enabled: false,
      used: false,
      reason: 'disabled',
    });
  });

  it('does not fetch for a missing or non-IMSLP source URL', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: true,
      promptText: 'Summarize the work history.',
      sourceContext: {
        imslpUrl: 'https://example.com/not-imslp',
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.promptText).toBe('Summarize the work history.');
    expect(result.sourceRag).toMatchObject({
      enabled: true,
      used: false,
      reason: 'invalid_or_missing_imslp_url',
    });
  });

  it('augments the prompt with retrieved IMSLP snippets when enabled', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(`
      <html>
        <head><title>Test Work (Composer)</title></head>
        <body>
          <p>This work is a piano prelude in C major by J. S. Bach.</p>
          <p>The source was first published in Leipzig and later edited in several urtext editions.</p>
          <p>Commentary often discusses Bach's prelude, the harmony, and the keyboard style.</p>
        </body>
      </html>
    `, { status: 200 }));
    global.fetch = fetchSpy as typeof global.fetch;

    const result = await augmentPromptWithSourceRag({
      enableSourceRag: true,
      promptText: 'Explain the publication history of this Bach prelude.',
      sourceContext: {
        workTitle: 'Prelude in C',
        composer: 'J. S. Bach',
        imslpUrl: 'https://imslp.org/wiki/Test_Work',
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.promptText).toContain('External Source Context (IMSLP)');
    expect(result.promptText).toContain('Source URL: https://imslp.org/wiki/Test_Work');
    expect(result.promptText).toContain('Retrieved page title: Test Work (Composer)');
    expect(result.promptText).toContain('publication history');
    expect(result.sourceRag).toMatchObject({
      enabled: true,
      used: true,
      sourceUrl: 'https://imslp.org/wiki/Test_Work',
    });
    expect(result.sourceRag.snippetCount).toBeGreaterThan(0);
  });
});
