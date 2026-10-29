import { beforeEach, describe, expect, it, vi } from 'vitest';

const prompt = vi.hoisted(() => vi.fn());
vi.mock('../../components/score-editor/prompt-for-text', () => ({ promptForText: prompt }));

import {
  addFrameText,
  addFretboardForHarmony,
  removeNoteAtPoint,
  toggleSnap,
} from '../../components/score-editor/commands';

/** `EditorCore` as these edits use it: they run the engine call inside performMutation. */
function setup() {
  const engine = vi.fn(async () => true);
  const core = {
    requireMutation: vi.fn(() => engine),
    ensureSelectionInWasm: vi.fn(async () => {}),
    performMutation: vi.fn(
      async (_label: string, action: () => Promise<unknown>, _options?: Record<string, unknown>) => action(),
    ),
  };
  return { engine, core, run: core as never };
}

/** The options performMutation was given for the one mutation run. */
const options = (core: ReturnType<typeof setup>['core']) => core.performMutation.mock.calls[0][2];

describe('context-menu edits', () => {
  beforeEach(() => prompt.mockReset());

  it('act on the engine’s selection: no re-projection before, no reselect after', async () => {
    for (const edit of [
      (run: never) => toggleSnap(run, 1),
      (run: never) => addFretboardForHarmony(run),
      (run: never) => removeNoteAtPoint(run, 0, 1, 2),
    ]) {
      const { core, run } = setup();
      await edit(run);
      expect(core.ensureSelectionInWasm).not.toHaveBeenCalled();
      expect(options(core)).toMatchObject({ skipWasmReselect: true, skipSelectionFallback: true });
    }
  });

  it('pass their arguments through to the engine', async () => {
    const snap = setup();
    await toggleSnap(snap.run, 0);
    expect(snap.engine).toHaveBeenCalledWith(0);
    const remove = setup();
    await removeNoteAtPoint(remove.run, 2, 30, 40);
    expect(remove.engine).toHaveBeenCalledWith(2, 30, 40);
  });

  it('asks for frame text first, and does nothing when the prompt is cancelled', async () => {
    prompt.mockResolvedValueOnce('Opus 1');
    const added = setup();
    await addFrameText(added.run, 2);
    expect(prompt).toHaveBeenCalledWith('Subtitle:');
    expect(added.engine).toHaveBeenCalledWith(2, 'Opus 1');

    prompt.mockResolvedValueOnce(null);
    const cancelled = setup();
    await addFrameText(cancelled.run, 1);
    expect(cancelled.core.performMutation).not.toHaveBeenCalled();
  });
});
