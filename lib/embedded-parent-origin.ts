import { resolveParentOrigin } from './playback/player-message-api';

/** Same-origin by default; cross-origin embeds must explicitly name the exact parent origin. */
export function embeddedParentOrigin(): string | null {
  return resolveParentOrigin(new URLSearchParams(window.location.search).get('parentOrigin'), window.location.origin);
}
