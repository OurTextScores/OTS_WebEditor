import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards a defect class that has bitten three times: an editor action prop is declared in
 * `score-editor/editorProps.ts`, used by a command, and never supplied by `ScoreEditor`. The
 * command is then permanently disabled, with no error anywhere.
 *
 *   - `onPlayAudio`                 -- full-transport playback, never reachable in the UI
 *   - `onPlayCurrentPageAudio`      -- same shape
 *   - `onRemoveContainingMeasures`  -- "Delete Selected Bars", lost in merge 014e6ebe
 *
 * Nothing else catches it. Every prop on EditorCommandProps is optional, so a missing one is
 * valid TypeScript, and the unit tests for the commands pass their own mock handlers. This
 * asserts the wiring contract directly against the source: `ScoreEditor` is the only
 * `useEditorCommands` caller, so a handler a command depends on must appear at that call.
 */

const REPO = resolve(__dirname, '..');

/** Handler props a command may depend on without ScoreEditor supplying them. */
const ALLOWED_UNWIRED = new Map<string, string>([]);

function callSiteProps(): Set<string> {
  const source = readFileSync(resolve(REPO, 'components/ScoreEditor.tsx'), 'utf8');
  // The call is `useEditorCommands({ ... });`, ending at the first `});` at its own indent.
  const block = source.match(/useEditorCommands\(\{[\s\S]*?\n {2}\}\);/);
  if (!block) throw new Error('Could not locate the useEditorCommands call in ScoreEditor.tsx');
  const props = new Set<string>();
  for (const m of block[0].matchAll(/(?:^|\s)(on[A-Z][A-Za-z0-9]*)\s*[:,]/g)) props.add(m[1]);
  return props;
}

/** Every `onFoo` the command definitions name: `p().onFoo`, `has('onFoo')`, `'onFoo'`. */
function commandHandlerRefs(): Set<string> {
  const source = readFileSync(resolve(REPO, 'components/score-editor/editorCommands.ts'), 'utf8');
  const refs = new Set<string>();
  // `p().onFoo`, `has('onFoo')` and the string keys the helpers take; comments name them bare.
  for (const m of source.matchAll(/[.']\s*(on[A-Z][A-Za-z0-9]*)\b/g)) refs.add(m[1]);
  return refs;
}

describe('editor command handler wiring', () => {
  it('locates the ScoreEditor call site and its handler props', () => {
    const supplied = callSiteProps();
    // If the extraction silently matched nothing useful, every assertion below would pass
    // vacuously and the guard would be worthless.
    expect(supplied.size).toBeGreaterThan(50);
    expect(supplied.has('onTogglePlayPause')).toBe(true);
    expect(supplied.has('onRemoveContainingMeasures')).toBe(true);
  });

  it('finds handler references in the command definitions', () => {
    const refs = commandHandlerRefs();
    expect(refs.size).toBeGreaterThan(50);
    expect(refs.has('onTogglePlayPause')).toBe(true);
    expect(refs.has('onRemoveContainingMeasures')).toBe(true);
  });

  it('supplies every handler the commands depend on', () => {
    const supplied = callSiteProps();
    const missing = [...commandHandlerRefs()].filter(
      (ref) => !supplied.has(ref) && !ALLOWED_UNWIRED.has(ref),
    );
    expect(
      missing,
      'These handlers are used by a command but never passed by ScoreEditor, so the command ' +
        'is dead in the running app. Wire them in the useEditorCommands call, or add them to ' +
        'ALLOWED_UNWIRED with a reason.',
    ).toEqual([]);
  });
});
