/**
 * The palette's compact navigation grammar (SHELL_REDESIGN_DESIGN §8.5): `m125` or `b125`
 * for a bar, `rA` for a rehearsal mark, `p3` for a page. The bar and rehearsal forms
 * follow Viritura's Jump Bar; the page form is an OTS addition.
 *
 * Re-implemented rather than copied: Viritura's resolver is written against its own score
 * model, and only this grammar carries over.
 */
export type NavigationTarget =
  | { readonly kind: 'bar'; readonly bar: number }
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'rehearsal'; readonly mark: string };

/**
 * In the palette's dedicated go-to mode (`gotoMode`) a lone number can only mean a bar and
 * a rehearsal mark may be any text. Mixed into command search, `r` also begins words like
 * "repeat", so a mark there must look like one: a letter, a number, or a letter and a
 * number (`rA`, `r12`, `rA2`). Returns null for anything that is not navigation, so the
 * caller falls back to command search.
 */
export function parseNavigationQuery(
  query: string,
  { gotoMode = false }: { gotoMode?: boolean } = {},
): NavigationTarget | null {
  const trimmed = query.trim();

  const bar = trimmed.match(/^[bm]\s*(\d+)$/i) ?? (gotoMode ? trimmed.match(/^(\d+)$/) : null);
  if (bar) {
    const value = Number(bar[1]);
    return Number.isSafeInteger(value) && value >= 1 ? { kind: 'bar', bar: value } : null;
  }

  const page = trimmed.match(/^p\s*(\d+)$/i);
  if (page) {
    const value = Number(page[1]);
    return Number.isSafeInteger(value) && value >= 1 ? { kind: 'page', page: value } : null;
  }

  const rehearsal = trimmed.match(/^r\s*(.+)$/i);
  if (rehearsal) {
    const mark = rehearsal[1].trim();
    if (!mark) return null;
    if (!gotoMode && !/^(?:[A-Za-z]|\d{1,3}|[A-Za-z]\d{1,2})$/.test(mark)) return null;
    return { kind: 'rehearsal', mark };
  }
  return null;
}

export function describeNavigationTarget(target: NavigationTarget): string {
  switch (target.kind) {
    case 'bar':
      return `Go to bar ${target.bar}`;
    case 'page':
      return `Go to page ${target.page}`;
    case 'rehearsal':
      return `Go to rehearsal mark ${target.mark}`;
  }
}
