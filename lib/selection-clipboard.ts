/**
 * Reads the engine's current selection as a clipboard payload.
 *
 * The ordering here is the whole point. `selectionMimeType()` and `selectionMimeData()`
 * are separate round-trips to the worker, and both must be *issued* before the caller
 * yields for anything else: the worker handles them in order, so they then describe the
 * selection as it was when the user pressed Ctrl+C. Awaiting anything first -- projecting
 * the UI selection into the engine, or even just the type before requesting the data --
 * lets the user's next click reach the engine in between, and the copy captures whatever
 * is selected by then. That produced a torn pair in practice: the mime of a two-note range
 * with the byte count of the single note clicked afterwards, which the engine accepts and
 * a later paste silently discards.
 */
export type SelectionClipboardPayload = {
  mimeType: string;
  data: Uint8Array;
};

export type SelectionReader = () => Promise<string> | string;
export type SelectionDataReader = () => Promise<Uint8Array> | Uint8Array;
export type SelectionPaster = (mimeType: string, data: Uint8Array) => Promise<unknown> | unknown;

export async function readSelectionPayload(
  getType: SelectionReader,
  getData: SelectionDataReader,
): Promise<SelectionClipboardPayload | null> {
  // Invoke both RPC wrappers before yielding so a later click cannot split the
  // MIME type and bytes across two different engine selections.
  const typePromise = Promise.resolve(getType());
  const dataPromise = Promise.resolve(getData());
  const [mimeType, data] = await Promise.all([typePromise, dataPromise]);
  if (!mimeType || !data || data.length === 0) {
    return null;
  }
  // Detach from the engine's buffer before it is stored: `selectionMimeData()` hands
  // back a view into the WASM heap, which the next operation can reuse or free.
  return {
    mimeType,
    data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data),
  };
}

/**
 * Dispatches paste before yielding when the engine selection and clipboard are already
 * ready. This matters for range payloads: selection-preview work from the destination
 * click is asynchronous, and an unrelated selection RPC landing before `cmdPaste` can
 * leave MuseScore without a valid single-note destination.
 */
export async function pasteClipboardPayload(options: {
  readPayload: () => SelectionClipboardPayload | null;
  copyInFlight: Promise<boolean> | null;
  selectionInFlight?: Promise<unknown> | null;
  selectionProjectionNeeded: boolean;
  ensureSelection: () => Promise<void>;
  paste: SelectionPaster | null;
  onEmpty?: () => void;
}): Promise<unknown> {
  const {
    readPayload,
    copyInFlight,
    selectionInFlight,
    selectionProjectionNeeded,
    ensureSelection,
    paste,
    onEmpty,
  } = options;

  if (copyInFlight || selectionInFlight) {
    await Promise.all([copyInFlight?.catch(() => false), selectionInFlight?.catch(() => false)]);
  }
  const payload = readPayload();
  if (!payload) {
    onEmpty?.();
    return false;
  }
  if (!paste) {
    return false;
  }
  if (selectionProjectionNeeded) {
    await ensureSelection();
  }
  return paste(payload.mimeType, payload.data);
}

/**
 * Reads the current selection and stores it, projecting the UI selection into the engine
 * only if the engine reports nothing selected. Returns whether anything was stored.
 */
export async function copySelectionToClipboard(options: {
  getType: SelectionReader | null;
  getData: SelectionDataReader | null;
  ensureSelection: () => Promise<void>;
  store: (payload: SelectionClipboardPayload) => void;
}): Promise<boolean> {
  const { getType, getData, ensureSelection, store } = options;
  if (!getType || !getData) {
    return false;
  }
  let payload = await readSelectionPayload(getType, getData);
  if (!payload) {
    await ensureSelection();
    payload = await readSelectionPayload(getType, getData);
  }
  if (!payload) {
    return false;
  }
  store(payload);
  return true;
}
