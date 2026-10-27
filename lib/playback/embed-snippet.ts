import type { HighlightMode } from './player-message-api';

/** What a visitor's player is set to; everything else in the page's URL belongs to the host that opened it. */
export type EmbedOptions = {
  highlight: HighlightMode;
  theme: 'auto' | 'light' | 'dark';
  /** Where playback starts, in whole seconds; 0 or absent starts at the beginning. */
  startSeconds?: number;
  /** Follow the music from page to page (the player's default). */
  follow?: boolean;
};

/**
 * The player URL to embed: this page's player with only the visitor-facing settings. The host's own parameters
 * (`playerId`, `parentOrigin`, `launchContext`) are dropped, since the page that embeds the snippet is not that host.
 * The score URL is made absolute so it means the same thing wherever the snippet is pasted. Null when there is no
 * score, or it is not one a visitor's browser could fetch (a local `blob:` or `data:` URL).
 */
export function embedPlayerUrl(pageHref: string, options: EmbedOptions): string | null {
  const page = new URL(pageHref);
  const score = page.searchParams.get('score');
  if (!score) return null;
  let scoreUrl: URL;
  try {
    scoreUrl = new URL(score, page);
  } catch {
    return null;
  }
  if (scoreUrl.protocol !== 'https:' && scoreUrl.protocol !== 'http:') return null;

  const url = new URL(page.pathname, page.origin);
  url.searchParams.set('score', scoreUrl.href);
  url.searchParams.set('embed', 'player');
  url.searchParams.set('highlight', options.highlight);
  if (options.theme !== 'auto') url.searchParams.set('theme', options.theme);
  const start = Math.floor(options.startSeconds ?? 0);
  if (start > 0) url.searchParams.set('start', String(start));
  if (options.follow === false) url.searchParams.set('follow', '0');
  return url.href;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The HTML to paste: a full-width iframe of the given height. `allow` lets the player start audio and go full screen. */
export function embedSnippet(src: string, { title, height }: { title: string; height: number }) {
  return (
    `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(title)}" ` +
    `width="100%" height="${Math.round(height)}" style="border:0;max-width:100%" ` +
    `allow="autoplay; fullscreen" loading="lazy"></iframe>`
  );
}

/** A page on this computer: a snippet made here would only play on this computer. */
export const isLocalOrigin = (href: string) =>
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(new URL(href).hostname);

/**
 * Whether a visitor with no account could load the score: a credential-less HEAD request. `false` only for an answer
 * that says no (401, 403, 404, 410); a network or CORS failure is `null` (unknown), never a false alarm.
 */
export async function scoreIsPublic(scoreUrl: string): Promise<boolean | null> {
  try {
    const response = await fetch(scoreUrl, {
      method: 'HEAD',
      credentials: 'omit',
      cache: 'no-store',
    });
    if ([401, 403, 404, 410].includes(response.status)) return false;
    return response.ok ? true : null;
  } catch {
    return null;
  }
}
