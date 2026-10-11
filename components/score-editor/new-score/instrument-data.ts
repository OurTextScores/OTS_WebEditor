/**
 * Where the New Score dialog's instrument data comes from.
 *
 * A normal deployment serves it from route handlers. The static embed has none: the same two
 * responses are shipped as files (`npm run generate:data` writes them to `public/data/`), and
 * the embed reads those. If it asks its host site for `/api/instruments/*` instead it gets the
 * host's 404, and the dialog opens with two warnings, a short instrument list, and a treble
 * clef for every instrument.
 */
export type InstrumentDataKind = 'clefs' | 'templates';

export function instrumentDataUrl(
  kind: InstrumentDataKind,
  embedBuild: boolean = process.env.NEXT_PUBLIC_BUILD_MODE === 'embed',
): string {
  return embedBuild ? `/score-editor/data/${kind}.json` : `/api/instruments/${kind}`;
}
