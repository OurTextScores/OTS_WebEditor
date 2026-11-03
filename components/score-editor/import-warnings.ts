import { notify } from '../shell/notices';

/** How many of the importer's problems the notice lists; the rest are counted. */
const LISTED = 8;

/**
 * The importer's problems with a file that still loaded (MEI, roadmap E25), as MuseScore reports them on File ▸ Open,
 * but as a notice: the score is open and the user decides whether to keep it.
 */
export function notifyImportWarnings(warnings: readonly string[]): void {
  if (!warnings.length) return;
  const count = warnings.length;
  const more = count > LISTED ? `\n…and ${count - LISTED} more` : '';
  notify({
    kind: 'warning',
    title: `${count} ${count === 1 ? 'problem' : 'problems'} occurred and the import may be incomplete.`,
    detail: warnings.slice(0, LISTED).join('\n') + more,
  });
}
