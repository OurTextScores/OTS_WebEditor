import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The server-rendered pages (no 'use client') must not reach a module that uses React hooks without being a client
// module itself: `next build` refuses it ("You're importing a module that depends on `useEffect` into a React Server
// Component module"), but the dev server, and so every other test, does not. The Help page reads the command catalog,
// which once reached the parts hook through the parts barrel.

const root = path.resolve(__dirname, '..');
const SERVER_ENTRIES = ['app/layout.tsx', 'app/help/page.tsx', 'app/test-icons/page.tsx'];
const HOOK =
  /\b(useEffect|useLayoutEffect|useState|useRef|useSyncExternalStore|useCallback|useMemo|useReducer|useContext|useTransition|useId)\b/;

const isClient = (source: string) => /^\s*(['"])use client\1/.test(source);

function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Modules a server entry reaches before any client boundary, with the hook-using ones among them. */
function serverModules(entry: string) {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const visit = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    if (isClient(source)) return;
    // Value imports from React with a hook in them (a type-only import is erased).
    for (const match of source.matchAll(/^import\s+(?!type\b)([^;]*?)\s+from\s+['"]react['"]/gm)) {
      if (HOOK.test(match[1])) offenders.push([...chain, path.relative(root, file)].join(' -> '));
    }
    for (const match of source.matchAll(
      /^(?:import|export)\s+(?!type\b)[^;]*?\s+from\s+['"]([^'"]+)['"]/gm,
    )) {
      const next = resolveImport(file, match[1]);
      if (next) visit(next, [...chain, path.relative(root, file)]);
    }
  };
  visit(path.join(root, entry), []);
  return { count: seen.size, offenders };
}

describe('server-rendered pages reach no hook outside a client module', () => {
  for (const entry of SERVER_ENTRIES) {
    it(entry, () => {
      const { count, offenders } = serverModules(entry);
      expect(count).toBeGreaterThan(0);
      expect(offenders).toEqual([]);
    });
  }
});
