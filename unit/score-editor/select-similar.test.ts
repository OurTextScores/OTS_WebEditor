import { describe, expect, it, vi } from 'vitest';
import { selectSimilar } from '../../components/score-editor/commands';
import { getNoticeSnapshot } from '../../components/shell/notices';

/** The engine call and the queue it runs on, as `EditorCore` supplies them. */
function setup(selected = true) {
  const engine = vi.fn(async () => selected);
  const core = {
    requireMutation: vi.fn(() => engine),
    runSerializedScoreOperation: vi.fn(<T,>(operation: () => Promise<T>) => operation()),
  };
  const refresh = { setHasBackendHighlighting: vi.fn(), refreshSelectionFromSvg: vi.fn(async () => {}) };
  return { engine, core: core as never, refresh };
}

describe('Select ▸ Similar', () => {
  it('patterns on the right-clicked point, in the scope asked, and redraws the list selection', async () => {
    const { engine, core, refresh } = setup();
    expect(await selectSimilar(core, refresh, 'staff', { page: 1, x: 2, y: 3 })).toBe(true);
    expect(engine).toHaveBeenCalledWith(1, 1, 2, 3);
    expect(refresh.setHasBackendHighlighting).toHaveBeenCalledWith(false);
    expect(refresh.refreshSelectionFromSvg).toHaveBeenCalledOnce();
  });

  it('patterns on the single selection without a point (the palette, the menu bar)', async () => {
    const { engine, core, refresh } = setup();
    await selectSimilar(core, refresh, 'all');
    expect(engine).toHaveBeenCalledWith(0, -1, 0, 0);
  });

  it('needs the clicked element in a range, and says so instead of guessing', async () => {
    const { engine, core, refresh } = setup();
    expect(await selectSimilar(core, refresh, 'range')).toBe(false);
    expect(engine).not.toHaveBeenCalled();
    expect(getNoticeSnapshot().notices.at(-1)?.title).toMatch(/Right-click an element in the range/);
    await selectSimilar(core, refresh, 'range', { page: 0, x: 5, y: 6 });
    expect(engine).toHaveBeenCalledWith(2, 0, 5, 6);
  });

  it('leaves the view alone when the engine selected nothing', async () => {
    const { core, refresh } = setup(false);
    expect(await selectSimilar(core, refresh, 'all')).toBe(false);
    expect(refresh.refreshSelectionFromSvg).not.toHaveBeenCalled();
  });
});
