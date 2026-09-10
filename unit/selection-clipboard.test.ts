import { describe, expect, it, vi } from 'vitest';
import {
  copySelectionToClipboard,
  pasteClipboardPayload,
  readSelectionPayload,
} from '../lib/selection-clipboard';

describe('readSelectionPayload', () => {
  it('issues both reads before awaiting either', async () => {
    // The ordering this module exists for. Awaiting the type before requesting the
    // data lets the user's next click reach the engine in between, and the copy then
    // describes one selection with the bytes of another.
    const order: string[] = [];
    let resolveType!: (value: string) => void;
    const getType = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          order.push('type:issued');
          resolveType = resolve;
        }),
    );
    const getData = vi.fn(() => {
      order.push('data:issued');
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    });

    const result = readSelectionPayload(getType, getData);
    expect(order).toEqual(['type:issued', 'data:issued']);
    resolveType('application/musescore/stafflist');
    await result;
  });

  it('detaches the bytes from the engine buffer', async () => {
    const engineHeap = new Uint8Array([1, 2, 3, 4]);
    const payload = await readSelectionPayload(
      () => 'application/musescore/symbol',
      () => engineHeap,
    );

    expect(payload?.data).toEqual(engineHeap);
    // A retained view would paste whatever later reused that region.
    expect(payload?.data).not.toBe(engineHeap);
    engineHeap.fill(0);
    expect(Array.from(payload!.data)).toEqual([1, 2, 3, 4]);
  });

  it('reports nothing for an empty selection', async () => {
    expect(
      await readSelectionPayload(
        () => '',
        () => new Uint8Array([1]),
      ),
    ).toBeNull();
    expect(
      await readSelectionPayload(
        () => 'x',
        () => new Uint8Array(),
      ),
    ).toBeNull();
  });
});

describe('pasteClipboardPayload', () => {
  const payload = {
    mimeType: 'application/musescore/stafflist',
    data: new Uint8Array([1, 2, 3]),
  };

  it('dispatches paste synchronously when no copy or projection is pending', async () => {
    const paste = vi.fn(() => Promise.resolve(true));
    const result = pasteClipboardPayload({
      readPayload: () => payload,
      copyInFlight: null,
      selectionProjectionNeeded: false,
      ensureSelection: vi.fn(async () => {}),
      paste,
    });

    expect(paste).toHaveBeenCalledWith(payload.mimeType, payload.data);
    await expect(result).resolves.toBe(true);
  });

  it('waits for required projection before pasting', async () => {
    const order: string[] = [];
    const paste = vi.fn(() => {
      order.push('paste');
      return true;
    });

    await pasteClipboardPayload({
      readPayload: () => payload,
      copyInFlight: null,
      selectionProjectionNeeded: true,
      ensureSelection: async () => {
        order.push('project');
      },
      paste,
    });

    expect(order).toEqual(['project', 'paste']);
  });

  it('waits for a destination click still in flight before pasting', async () => {
    const order: string[] = [];
    let finishSelection!: () => void;
    const selectionInFlight = new Promise<void>((resolve) => {
      finishSelection = () => {
        order.push('selection');
        resolve();
      };
    });
    const paste = vi.fn(() => {
      order.push('paste');
      return true;
    });

    const result = pasteClipboardPayload({
      readPayload: () => payload,
      copyInFlight: null,
      selectionInFlight,
      selectionProjectionNeeded: false,
      ensureSelection: vi.fn(async () => {}),
      paste,
    });

    expect(paste).not.toHaveBeenCalled();
    finishSelection();
    await result;
    expect(order).toEqual(['selection', 'paste']);
  });
});

describe('copySelectionToClipboard', () => {
  const payloadReaders = () => ({
    getType: vi.fn(() => Promise.resolve('application/musescore/stafflist')),
    getData: vi.fn(() => Promise.resolve(new Uint8Array([9, 9]))),
  });

  it('stores what the engine already has, without projecting the UI selection', async () => {
    const { getType, getData } = payloadReaders();
    const ensureSelection = vi.fn(async () => {});
    const store = vi.fn();

    expect(await copySelectionToClipboard({ getType, getData, ensureSelection, store })).toBe(true);
    expect(store).toHaveBeenCalledWith({
      mimeType: 'application/musescore/stafflist',
      data: new Uint8Array([9, 9]),
    });
    // Projecting would collapse a range the engine is already holding.
    expect(ensureSelection).not.toHaveBeenCalled();
  });

  it('projects the UI selection and retries only when the engine has nothing', async () => {
    let selected = false;
    const ensureSelection = vi.fn(async () => {
      selected = true;
    });
    const store = vi.fn();

    const ok = await copySelectionToClipboard({
      getType: () => (selected ? 'application/musescore/symbol' : ''),
      getData: () => new Uint8Array([7]),
      ensureSelection,
      store,
    });

    expect(ok).toBe(true);
    expect(ensureSelection).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith({
      mimeType: 'application/musescore/symbol',
      data: new Uint8Array([7]),
    });
  });

  it('stores nothing when there is still no selection after projecting', async () => {
    const store = vi.fn();

    const ok = await copySelectionToClipboard({
      getType: () => '',
      getData: () => new Uint8Array([1]),
      ensureSelection: async () => {},
      store,
    });

    expect(ok).toBe(false);
    expect(store).not.toHaveBeenCalled();
  });

  it('reports failure when the build lacks the bindings', async () => {
    const store = vi.fn();

    expect(
      await copySelectionToClipboard({
        getType: null,
        getData: null,
        ensureSelection: async () => {},
        store,
      }),
    ).toBe(false);
    expect(store).not.toHaveBeenCalled();
  });
});
