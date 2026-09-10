import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompareClipboard } from '../components/score-editor/compare/useCompareClipboard';
import type { Score } from '../lib/webmscore-loader';

const renderClipboard = () => {
  const labels: string[] = [];
  // Not vi.fn: wrapping a generic callback erases its type parameter, so the mock no
  // longer satisfies the hook's runSerialized signature. The labels array is the
  // observable we actually assert on.
  const runSerialized = <T,>(operation: () => Promise<T>, label: string): Promise<T> => {
    labels.push(label);
    return operation();
  };
  const reportUnsupported = vi.fn();
  const hook = renderHook(() => useCompareClipboard({ runSerialized, reportUnsupported }));
  return { ...hook, labels, reportUnsupported };
};

const makeScore = (mimeType: unknown, data: unknown) =>
  ({
    selectionMimeType: vi.fn(async () => mimeType),
    selectionMimeData: vi.fn(async () => data),
  }) as unknown as Score;

describe('useCompareClipboard', () => {
  it('detaches copied bytes from the engine buffer', async () => {
    const engineBuffer = new Uint8Array([1, 2, 3]);
    const score = makeScore('application/musicxml', engineBuffer);
    const clipboard = renderClipboard();

    await act(async () => {
      await clipboard.result.current.copySelection(score, 'left');
    });

    // The engine is free to reuse its heap after the call returns.
    engineBuffer[0] = 99;

    expect(clipboard.result.current.readClipboard()).toEqual({
      mimeType: 'application/musicxml',
      data: new Uint8Array([1, 2, 3]),
    });
  });

  it('runs the copy through the serialized runner labelled by side', async () => {
    const score = makeScore('application/musicxml', new Uint8Array([7]));
    const clipboard = renderClipboard();

    await act(async () => {
      await clipboard.result.current.copySelection(score, 'right');
    });

    expect(clipboard.labels).toEqual(['compare-copy-selection:right']);
  });

  it('reports an unsupported build and leaves the clipboard untouched', async () => {
    const clipboard = renderClipboard();
    act(() => {
      clipboard.result.current.writeClipboard({
        mimeType: 'application/musicxml',
        data: new Uint8Array([5]),
      });
    });

    let copied = true;
    await act(async () => {
      copied = await clipboard.result.current.copySelection({} as Score, 'left');
    });

    expect(copied).toBe(false);
    expect(clipboard.reportUnsupported).toHaveBeenCalledOnce();
    expect(clipboard.result.current.readClipboard()?.data).toEqual(new Uint8Array([5]));
  });

  it.each([
    ['no mime type', '', new Uint8Array([1])],
    ['empty selection data', 'application/musicxml', new Uint8Array()],
    ['missing selection data', 'application/musicxml', null],
  ])('keeps the previous clipboard when the engine reports %s', async (_label, mimeType, data) => {
    const clipboard = renderClipboard();
    act(() => {
      clipboard.result.current.writeClipboard({
        mimeType: 'application/musicxml',
        data: new Uint8Array([42]),
      });
    });

    let copied = true;
    await act(async () => {
      copied = await clipboard.result.current.copySelection(makeScore(mimeType, data), 'left');
    });

    expect(copied).toBe(false);
    expect(clipboard.result.current.readClipboard()?.data).toEqual(new Uint8Array([42]));
  });

  it('shares one slot so a compare copy is visible to the main editor paste path', async () => {
    const score = makeScore('application/musicxml', new Uint8Array([8, 9]));
    const clipboard = renderClipboard();

    await act(async () => {
      await clipboard.result.current.copySelection(score, 'left');
    });

    expect(clipboard.result.current.clipboardRef.current?.data).toEqual(new Uint8Array([8, 9]));
    expect(clipboard.result.current.readClipboard()).toBe(
      clipboard.result.current.clipboardRef.current,
    );
  });
});
