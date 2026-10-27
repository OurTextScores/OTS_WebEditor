// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbedSnippetControl from '@/components/score-player/EmbedSnippetControl';
import {
  embedPlayerUrl,
  embedSnippet,
  isLocalOrigin,
  scoreIsPublic,
} from '@/lib/playback/embed-snippet';

const SCORE = 'https://www.ourtextscores.com/api/works/1/sources/a/canonical.xml';
const PAGE =
  'https://www.ourtextscores.com/score-editor/index.html?' +
  new URLSearchParams({
    score: SCORE,
    embed: 'player',
    playerId: 'preview-7',
    parentOrigin: 'https://www.ourtextscores.com',
    launchContext: '{"workId":"1"}',
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('embedPlayerUrl', () => {
  it("keeps the score and the visitor's settings, and drops the host's own parameters", () => {
    const url = new URL(
      embedPlayerUrl(PAGE, { highlight: 'note', theme: 'dark', startSeconds: 42.7 })!,
    );
    expect(url.origin + url.pathname).toBe('https://www.ourtextscores.com/score-editor/index.html');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      score: SCORE,
      embed: 'player',
      highlight: 'note',
      theme: 'dark',
      start: '42',
    });
  });

  it('leaves defaults out of the URL', () => {
    const url = new URL(embedPlayerUrl(PAGE, { highlight: 'measure', theme: 'auto' })!);
    expect([...url.searchParams.keys()]).toEqual(['score', 'embed', 'highlight']);
  });

  it('makes a relative score address absolute, so it means the same on another site', () => {
    const page = 'https://example.org/score-editor/index.html?score=/scores/a.mscz&embed=player';
    const url = new URL(embedPlayerUrl(page, { highlight: 'measure', theme: 'auto' })!);
    expect(url.searchParams.get('score')).toBe('https://example.org/scores/a.mscz');
  });

  it('has nothing to embed for a score from this computer or no score at all', () => {
    for (const score of ['blob:https://example.org/1234', 'data:text/xml,<x/>']) {
      const page = `https://example.org/?${new URLSearchParams({ score, embed: 'player' })}`;
      expect(embedPlayerUrl(page, { highlight: 'measure', theme: 'auto' })).toBeNull();
    }
    expect(
      embedPlayerUrl('https://example.org/?embed=player', { highlight: 'measure', theme: 'auto' }),
    ).toBeNull();
  });
});

describe('embedSnippet', () => {
  it('is an iframe whose attributes cannot be broken out of', () => {
    const html = embedSnippet('https://a.org/?x=1&y="2"', {
      title: 'Bach <"BWV 1">',
      height: 480.4,
    });
    expect(html).toBe(
      '<iframe src="https://a.org/?x=1&amp;y=&quot;2&quot;" title="Bach &lt;&quot;BWV 1&quot;&gt;" ' +
        'width="100%" height="480" style="border:0;max-width:100%" allow="autoplay; fullscreen" loading="lazy"></iframe>',
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html').querySelector('iframe')!;
    expect(parsed.getAttribute('src')).toBe('https://a.org/?x=1&y="2"');
    expect(parsed.getAttribute('title')).toBe('Bach <"BWV 1">');
  });
});

describe('isLocalOrigin and scoreIsPublic', () => {
  it('knows a page on this computer', () => {
    expect(isLocalOrigin('http://localhost:3000/?a')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:3100/')).toBe(true);
    expect(isLocalOrigin('https://www.ourtextscores.com/')).toBe(false);
  });

  it('says not public only when the server says no, never on a network failure', async () => {
    const answer = (status: number) =>
      vi.fn(async () => ({ ok: status < 400, status }) as Response);
    vi.stubGlobal('fetch', answer(200));
    expect(await scoreIsPublic(SCORE)).toBe(true);
    vi.stubGlobal('fetch', answer(403));
    expect(await scoreIsPublic(SCORE)).toBe(false);
    vi.stubGlobal('fetch', answer(500));
    expect(await scoreIsPublic(SCORE)).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await scoreIsPublic(SCORE)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      SCORE,
      expect.objectContaining({ method: 'HEAD', credentials: 'omit' }),
    );
  });
});

describe('the Embed dialog', () => {
  const open = (status: number, positionMs = 0) => {
    window.history.replaceState(null, '', `/?${new URL(PAGE).searchParams}`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: status < 400, status }) as Response),
    );
    render(
      <EmbedSnippetControl title="String Quartet" highlightMode="note" positionMs={positionMs} />,
    );
    fireEvent.click(screen.getByTestId('player-embed'));
  };
  const snippet = () => (screen.getByTestId('embed-snippet') as HTMLTextAreaElement).value;
  const src = () => new URL(/src="([^"]+)"/.exec(snippet())![1].replace(/&amp;/g, '&'));

  it("starts from the player's highlighting and follows the choices", () => {
    open(200, 75_000);
    expect(src().searchParams.get('highlight')).toBe('note');
    expect(snippet()).toContain('title="String Quartet"');
    fireEvent.click(screen.getByRole('button', { name: 'Measures' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByTestId('embed-start-here'));
    fireEvent.change(screen.getByTestId('embed-height'), { target: { value: '720' } });
    expect(src().searchParams.get('highlight')).toBe('measure');
    expect(src().searchParams.get('theme')).toBe('dark');
    expect(src().searchParams.get('start')).toBe('75');
    expect(src().searchParams.get('playerId')).toBeNull();
    expect(snippet()).toContain('height="720"');
  });

  it('copies the code', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    open(200);
    fireEvent.click(screen.getByTestId('embed-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(snippet()));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('warns when visitors could not load the score', async () => {
    open(403);
    expect(await screen.findByTestId('embed-private-warning')).toBeInTheDocument();
  });

  it('does not warn for a public score', async () => {
    open(200);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('embed-private-warning')).toBeNull();
  });
});
