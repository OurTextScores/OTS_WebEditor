import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The palette rules from docs/private/DESIGN_LANGUAGE.md §4: one neutral (slate) and one green
 * (emerald). Tailwind's gray and green scales are near-duplicates of those and made the UI
 * look inconsistent; this keeps them from coming back.
 */
const root = resolve(__dirname, '..');
const SOURCE = /\.(tsx?|css)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return files(path);
    return SOURCE.test(name) ? [path] : [];
  });
}

describe('palette guard', () => {
  const offenders = (pattern: RegExp) =>
    ['components', 'app']
      .flatMap((dir) => files(join(root, dir)))
      .filter((path) => pattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(root.length + 1));

  it('uses slate, not gray, for neutrals', () => {
    expect(offenders(/-gray-\d/)).toEqual([]);
  });

  it('uses emerald, not green', () => {
    expect(offenders(/-green-\d/)).toEqual([]);
  });

  /**
   * Raw hex colours are for domain colours (docs/private/DESIGN_LANGUAGE.md §4.4) and the
   * token fallbacks in vendored CSS. A new hex goes into globals.css as a token instead. The
   * counts are a ratchet: lower one when you remove a hex, never raise it.
   */
  const HEX_BUDGET: Record<string, number> = {
    // The editor's syntax-highlighting theme: a domain palette of its own.
    'components/CodeMirrorEditor.tsx': 88,
    // Fallbacks inside var(--shell-*, #hex) in the vendored Viritura panels.
    'components/shell/vendor/viritura/Panel.module.css': 13,
    'components/shell/vendor/viritura/WorkspaceShell.module.css': 5,
    // The same, for var(--ots-text, #0f172a).
    'components/FloatingPalettes.module.css': 2,
    'components/shell/toolbar/WriteToolbar.module.css': 1,
    // MuseScore's voice colours, and a black/white swatch pair in the inspector.
    'components/ScoreEditor.tsx': 4,
    'components/InspectorPanel.tsx': 1,
    // Banner washes that have no token yet.
    'components/score-editor/LeftSidebar.tsx': 4,
  };

  it('does not add raw hex colours outside the budget', () => {
    const over: string[] = [];
    for (const dir of ['components', 'app']) {
      for (const path of files(join(root, dir))) {
        const rel = path.slice(root.length + 1);
        if (rel === 'app/globals.css') continue; // the token source
        const count = readFileSync(path, 'utf8').match(/#[0-9a-fA-F]{6}\b/g)?.length ?? 0;
        if (count > (HEX_BUDGET[rel] ?? 0)) over.push(`${rel}: ${count} > ${HEX_BUDGET[rel] ?? 0}`);
      }
    }
    expect(over).toEqual([]);
  });

  it('uses the type roles, not arbitrary pixel font sizes', () => {
    // text-caption (11px) is the smallest role; the rest are Tailwind's text-xs/sm/base/xl.
    expect(offenders(/\btext-\[\d+(\.\d+)?px\]/)).toEqual([]);
  });
});
