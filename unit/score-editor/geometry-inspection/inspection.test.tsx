import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScoreGeometryInspection } from '../../../components/score-editor/geometry-inspection/useScoreGeometryInspection';
import type { Score, ScoreObjectHit } from '../../../lib/webmscore-loader';

vi.mock('../../../lib/svg-screen-matrix', () => ({
  svgScreenMapping: () => ({ toEngraving: (x: number, y: number) => ({ x, y }) }),
}));

const hit: ScoreObjectHit = {
  status: 'ok', schemaVersion: 1, coordinateSpace: 'page-local-360dpi', kind: 'note',
  location: { measureIndex: 0, staffIndex: 0, voiceIndex: 0 },
  geometry: { page: 0, x: 1, y: 2, width: 3, height: 4 },
};

describe('geometry inspection', () => {
  it('rejects a pending result after a score or page switch', async () => {
    let resolveHit!: (value: ScoreObjectHit) => void;
    const first = { hitTestScoreObject: vi.fn(() => new Promise<ScoreObjectHit>(resolve => { resolveHit = resolve; })) } as unknown as Score;
    const second = { hitTestScoreObject: vi.fn(async () => hit) } as unknown as Score;
    const container = document.createElement('div');
    container.innerHTML = '<svg></svg>';
    const containerRef = { current: container };
    const installGenerationRef = { current: 0 };
    const hook = renderHook(({ score, page }) => useScoreGeometryInspection({ score, page, containerRef, installGenerationRef }),
      { initialProps: { score: first, page: 0 } });
    act(() => container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true, clientX: 2, clientY: 3 })));
    await waitFor(() => expect(first.hitTestScoreObject).toHaveBeenCalled());
    hook.rerender({ score: second, page: 1 });
    await act(async () => resolveHit(hit));
    expect(hook.result.current.status).toBe('idle');
    expect(second.hitTestScoreObject).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('discards an in-flight response when a render claims the canvas', async () => {
    let resolveHit!: (value: ScoreObjectHit) => void;
    const score = { hitTestScoreObject: vi.fn(() => new Promise<ScoreObjectHit>(resolve => { resolveHit = resolve; })) } as unknown as Score;
    const container = document.createElement('div');
    container.innerHTML = '<svg></svg>';
    const installGenerationRef = { current: 0 };
    const containerRef = { current: container };
    const hook = renderHook(() => useScoreGeometryInspection({ score, page: 0, containerRef, installGenerationRef }));
    act(() => container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true })));
    await waitFor(() => expect(score.hitTestScoreObject).toHaveBeenCalled());
    installGenerationRef.current++;
    await act(async () => resolveHit(hit));
    expect(hook.result.current.status).toBe('stale');
    hook.unmount();
  });
});
