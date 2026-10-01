import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards a defect class that has now bitten three times: a toolbar action prop is
 * declared in `toolbar/types.ts`, consumed by a section, and never supplied by
 * `ScoreEditor`. The button then renders permanently disabled (sections guard on
 * `!onX`) or inert, with no error anywhere.
 *
 *   - `onPlayAudio`                 -- full-transport playback, never reachable in the UI
 *   - `onPlayCurrentPageAudio`      -- same shape
 *   - `onRemoveContainingMeasures`  -- "Delete Selected Bars", lost in merge 014e6ebe
 *
 * Nothing else catches it. Every prop on ToolbarSectionProps is optional, so a
 * missing one is valid TypeScript. The unit tests for these buttons pass their own
 * mock handlers, so they stay green while the real app is broken. Only an
 * end-to-end click would notice, and there is not one per button.
 *
 * This asserts the wiring contract directly against the source: ScoreEditor is the
 * only app-level `<Toolbar>` consumer, and Toolbar spreads its props unchanged into
 * every section (`<section.Component {...props} />`), so a handler a section
 * references must appear at that call site.
 */

const REPO = resolve(__dirname, '..');
const SECTIONS_DIR = resolve(REPO, 'components/toolbar/sections');

/**
 * Handler props a section may reference without ScoreEditor supplying one.
 * Add here only with a reason -- an entry is an admission that a control is dead.
 */
const ALLOWED_UNWIRED = new Map<string, string>([
  [
    'onOpenTransposeDialog',
    'Supplied by Toolbar itself, which owns TransposeDialog so a command can open it too.',
  ],
]);

function toolbarCallSiteProps(): Set<string> {
  const source = readFileSync(resolve(REPO, 'components/ScoreEditor.tsx'), 'utf8');
  // The call site is one self-closing JSX element; it ends at the first `/>` that
  // sits alone on its own line.
  const block = source.match(/<Toolbar\b[\s\S]*?\n[ \t]*\/>/);
  if (!block) {
    throw new Error('Could not locate the <Toolbar .../> call site in ScoreEditor.tsx');
  }
  const props = new Set<string>();
  for (const m of block[0].matchAll(/(?:^|\s)(on[A-Z][A-Za-z0-9]*)\s*=/g)) {
    props.add(m[1]);
  }
  return props;
}

/** Handler props each section references in a JSX expression, e.g. onClick={onFoo}. */
function sectionHandlerRefs(): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const file of readdirSync(SECTIONS_DIR).filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(resolve(SECTIONS_DIR, file), 'utf8');
    const refs = new Set<string>();
    // `{onFoo}` as a whole expression: onClick={onFoo}, and `!onFoo` inside a
    // disabled={...} guard -- the two ways a section depends on a supplied handler.
    for (const m of source.matchAll(/\{\s*(on[A-Z][A-Za-z0-9]*)\s*\}/g)) refs.add(m[1]);
    for (const m of source.matchAll(/!\s*(on[A-Z][A-Za-z0-9]*)\b/g)) refs.add(m[1]);
    if (refs.size > 0) byFile.set(file, refs);
  }
  return byFile;
}

describe('toolbar handler wiring', () => {
  it('locates the ScoreEditor -> Toolbar call site and its handler props', () => {
    const supplied = toolbarCallSiteProps();
    // Sanity: if the extraction silently matched nothing useful, every assertion
    // below would pass vacuously and the guard would be worthless.
    expect(supplied.size).toBeGreaterThan(50);
    expect(supplied.has('onTogglePlayPause')).toBe(true);
    expect(supplied.has('onRemoveContainingMeasures')).toBe(true);
  });

  it('finds handler references in the toolbar sections', () => {
    const byFile = sectionHandlerRefs();
    expect(byFile.size).toBeGreaterThan(5);
    expect(byFile.get('PlaybackSection.tsx')).toContain('onTogglePlayPause');
    expect(byFile.get('MeasuresSection.tsx')).toContain('onRemoveContainingMeasures');
  });

  it('supplies every handler its sections depend on', () => {
    const supplied = toolbarCallSiteProps();
    const missing: string[] = [];

    for (const [file, refs] of sectionHandlerRefs()) {
      for (const ref of refs) {
        if (supplied.has(ref) || ALLOWED_UNWIRED.has(ref)) continue;
        missing.push(`${file}: ${ref}`);
      }
    }

    expect(
      missing,
      'These toolbar handlers are referenced by a section but never passed by ' +
        'ScoreEditor, so their controls are dead in the running app. Wire them at ' +
        'the <Toolbar .../> call site, or add them to ALLOWED_UNWIRED with a reason.',
    ).toEqual([]);
  });
});
