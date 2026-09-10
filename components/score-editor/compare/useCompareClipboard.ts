import { useCallback, useRef } from 'react';
import type { Score } from '@/lib/webmscore-loader';
import type { CompareSide } from './compare-types';

export type CompareClipboardEntry = {
  mimeType: string;
  data: Uint8Array;
};

type CompareClipboardOptions = {
  runSerialized: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  reportUnsupported: () => void;
};

/**
 * Owns the native selection clipboard.
 *
 * The slot is deliberately shared with the main editor rather than duplicated per role:
 * paste must work main -> main, main -> compare, and across panes, and a second slot
 * would let the two disagree about what was last copied. What this hook owns is the
 * copy operation and the invariant that the bytes are detached from the engine before
 * they are stored.
 */
export function useCompareClipboard({ runSerialized, reportUnsupported }: CompareClipboardOptions) {
  const clipboardRef = useRef<CompareClipboardEntry | null>(null);

  const readClipboard = useCallback(() => clipboardRef.current, []);

  const writeClipboard = useCallback((entry: CompareClipboardEntry | null) => {
    clipboardRef.current = entry;
  }, []);

  const copySelection = useCallback(
    async (targetScore: Score, side: CompareSide) => {
      if (!targetScore.selectionMimeType || !targetScore.selectionMimeData) {
        reportUnsupported();
        return false;
      }
      const copied = await runSerialized(async () => {
        const mimeType = await Promise.resolve(targetScore.selectionMimeType!());
        if (!mimeType) {
          return null;
        }
        const data = await Promise.resolve(targetScore.selectionMimeData!());
        if (!data || data.byteLength === 0) {
          return null;
        }
        // Detach from the engine's buffer: the WASM heap backing `data` can be
        // reused or freed by the next operation, and a retained view would then
        // paste whatever replaced it.
        return { mimeType, data: data.slice() };
      }, `compare-copy-selection:${side}`);
      if (!copied) {
        return false;
      }
      clipboardRef.current = copied;
      return true;
    },
    [reportUnsupported, runSerialized],
  );

  return {
    clipboardRef,
    copySelection,
    readClipboard,
    writeClipboard,
  };
}
