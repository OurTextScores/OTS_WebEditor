import { primaryShortcut } from '../../lib/commands/bindings';
import type { CommandRegistry } from '../../lib/commands/registry';
import {
  isCommandFamily,
  type Command,
  type CommandContext,
  type CommandFamily,
  type CommandId,
  unmetReason,
} from '../../lib/commands/types';
import { variantPathKey } from './menus';

/** One searchable line in the palette: a command, or one variant of a family. */
export interface PaletteRow {
  /** Stable across sessions; what recents are remembered by. */
  readonly key: string;
  readonly commandId: CommandId;
  readonly arg?: unknown;
  readonly title: string;
  /** Where it lives in the menus, e.g. "Add ▸ Marks ▸ Dynamics". */
  readonly path: string;
  readonly keywords: readonly string[];
  readonly shortcut?: string;
  readonly enabled: boolean;
  /** Why it is unavailable right now, when the command says. */
  readonly disabledReason?: string;
}

/** Commands that need arguments the palette has no form for; they are reached from panels. */
const NOT_SEARCHABLE: ReadonlySet<CommandId> = new Set([
  'instruments.add',
  'instruments.part.toggleVisible',
  'instruments.part.remove',
  'file.openRecent',
]);

/**
 * Every command in the registry as palette rows, with family variants expanded
 * ("Clef: Bass", "Time Signature: Common time"). `enabled` is evaluated now, against the
 * live context, so the caller builds rows when the palette opens, not on every keystroke.
 */
export function buildPaletteRows(
  registry: CommandRegistry,
  ctx: CommandContext,
  paths: ReadonlyMap<string, string>,
): PaletteRow[] {
  const rows: PaletteRow[] = [];
  for (const id of registry.ids()) {
    if (NOT_SEARCHABLE.has(id)) continue;
    const entry = registry.get(id);
    if (!entry) continue;
    const enabled = entry.enabled ? entry.enabled(ctx) : true;
    const reason = unmetReason(entry.enabled, ctx);
    const why = reason ? { disabledReason: reason } : {};

    if (isCommandFamily(entry)) {
      const family = entry as unknown as CommandFamily<unknown>;
      const familyPath = paths.get(`${id}\0*`) ?? '';
      for (const variant of family.variants) {
        rows.push({
          key: `${id}\0${JSON.stringify(variant.arg)}`,
          commandId: id,
          arg: variant.arg,
          title: `${family.label}: ${variant.label}`,
          // A variant given its own menu entry ("Zoom to 100%") reports that location.
          path: paths.get(variantPathKey(id, variant.arg)) ?? familyPath,
          keywords: [],
          shortcut: primaryShortcut(id, variant.arg),
          enabled,
          ...why,
        });
      }
      continue;
    }

    const command = entry as unknown as Command;
    rows.push({
      key: id,
      commandId: id,
      title: command.label,
      path: paths.get(id) ?? '',
      keywords: command.keywords ?? [],
      shortcut: primaryShortcut(id),
      enabled,
      ...why,
    });
  }
  return rows;
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Is `needle` a subsequence of `haystack` (every character in order, gaps allowed)? */
function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0;
  for (const character of haystack) {
    if (character === needle[at]) at += 1;
    if (at === needle.length) return true;
  }
  return false;
}

function scoreToken(row: PaletteRow, token: string): number {
  const title = row.title.toLowerCase();
  if (title.startsWith(token)) return 100;
  if (words(row.title).some((word) => word.startsWith(token))) return 80;
  if (title.includes(token)) return 60;
  if (row.keywords.some((keyword) => keyword.toLowerCase().includes(token))) return 40;
  if (row.path.toLowerCase().includes(token)) return 30;
  if (token.length >= 3 && isSubsequence(token, title)) return 15;
  return 0;
}

/**
 * Fuzzy search over title, keywords and menu path. Every whitespace-separated token must
 * match something; a title match outranks a keyword, which outranks the menu path. Stable
 * for equal scores, so the registry's order breaks ties.
 */
export function searchPaletteRows(
  rows: readonly PaletteRow[],
  query: string,
  limit = 60,
): PaletteRow[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return rows.slice(0, limit);

  const scored: { row: PaletteRow; score: number; index: number }[] = [];
  rows.forEach((row, index) => {
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(row, token);
      if (score === 0) return;
      total += score;
    }
    // Prefer an available command over an unavailable one of the same relevance.
    scored.push({ row, score: total + (row.enabled ? 5 : 0), index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((entry) => entry.row);
}

const RECENTS_KEY = 'ots.palette.recents';
const MAX_RECENTS = 8;

/** localStorage can be absent, full or blocked; the palette must work without it. */
export function readPaletteRecents(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string').slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

export function rememberPaletteRecent(key: string): void {
  try {
    const next = [key, ...readPaletteRecents().filter((existing) => existing !== key)];
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next.slice(0, MAX_RECENTS)));
  } catch {
    // Not remembering a recent is not worth interrupting the command that just ran.
  }
}
