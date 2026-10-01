import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SHELL_REDESIGN_DESIGN §10, Phase 4 exit criterion: the editor does not re-derive "which
 * surface am I" from the URL in handlers. `selectWorkspaceMode` decides it once; everything
 * else reads the mode's kind or traits. These names were the old per-site booleans, so
 * finding one again means somebody reintroduced a parallel mode switch.
 */
const REPO = resolve(__dirname, '../..');
const FORBIDDEN =
  /\b(isEmbedMode|isChangeReviewSingleScoreMode|isAnyRowsMode|isSystemRowsMode|isFindingsRowsMode|isCompareEmbedMode)\b/;
// The selector documents the old names in its comments while explaining the precedence.
const ALLOWED = new Set(['components/shell/selectWorkspaceMode.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('mode booleans', () => {
  it('no longer exist outside selectWorkspaceMode', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(join(REPO, dir)))
      .map((path) => relative(REPO, path))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => FORBIDDEN.test(readFileSync(join(REPO, path), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
