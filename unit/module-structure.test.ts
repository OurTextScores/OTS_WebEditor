import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The module-structure rules in AGENTS.md ("Module structure"), as checks. They are Viritura's
 * rules 3 and 6: a file is named for the concept it holds, never its kind, and a lint
 * suppression says why. Both are cheap to keep and expensive to retrofit.
 *
 * The suppression markers are assembled from parts so this file does not count as a suppression
 * in the debt audit, which greps the tree for them.
 */
const ESLINT_MARKER = ['eslint', 'disable'].join('-');
const TS_MARKERS = ['@ts', 'ignore'].join('-') + '|' + ['@ts', 'expect', 'error'].join('-');
const DIRECTIVE = new RegExp(`(${ESLINT_MARKER}(?:-next-line|-line)?|${TS_MARKERS})(.*)$`);
const TS_DIRECTIVE = new RegExp(`(${TS_MARKERS})\\s+\\S`);

const root = resolve(__dirname, '..');
const SOURCE_ROOTS = ['app', 'components', 'lib'];
const ALL_ROOTS = [...SOURCE_ROOTS, 'unit', 'tests'];

function walk(dir: string, onFile: (path: string) => void, onDir?: (path: string) => void): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      onDir?.(path);
      walk(path, onFile, onDir);
    } else {
      onFile(path);
    }
  }
}

const rel = (path: string) => path.slice(root.length + 1);

describe('module structure', () => {
  // `common` is on the list although Viritura's is not: it is the same smell, and OTS had one.
  const BANNED_NAMES = /^(utils?|helpers?|shared|internal|misc|common)\.(tsx?|mjs|js)$/;
  const BANNED_DIRS = new Set(['utils', 'helpers', 'shared', 'misc']);

  it('has no grab-bag file or folder names under app, components and lib', () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_ROOTS) {
      walk(
        join(root, dir),
        (path) => {
          if (BANNED_NAMES.test(path.split('/').pop() ?? '')) offenders.push(rel(path));
        },
        (path) => {
          if (BANNED_DIRS.has(path.split('/').pop() ?? '')) offenders.push(`${rel(path)}/`);
        },
      );
    }
    expect(offenders).toEqual([]);
  });

  it('gives every lint or type suppression a reason after "--"', () => {
    const offenders: string[] = [];
    for (const dir of ALL_ROOTS) {
      walk(join(root, dir), (path) => {
        if (!/\.(tsx?|mjs|js)$/.test(path)) return;
        readFileSync(path, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            const directive = line.match(DIRECTIVE);
            // Only a comment can be a directive; a string that mentions one is not.
            if (!directive || !/(\/\/|\/\*)/.test(line.slice(0, line.indexOf(directive[1]))))
              return;
            if (!/\s--\s*\S/.test(directive[2]) && !TS_DIRECTIVE.test(line)) {
              offenders.push(`${rel(path)}:${index + 1}`);
            }
          });
      });
    }
    expect(offenders).toEqual([]);
  });
});
