import { useCallback, useEffect, useState } from 'react';
import type { ElementPropertyState } from '../../../lib/webmscore-loader';
import type { EditorCore } from '../core';
import { NOTATION_PROPERTIES, notationPropertyNames } from './notationProperties';

/**
 * The selection's typed notation properties (roadmap E09): read from the engine whenever the selection or the score
 * changes (`refreshKey`), and set as one undoable edit each. `set(name, null)` resets a property to its style default.
 */
export function useNotationProperties(
  core: Pick<EditorCore, 'score' | 'performMutation' | 'runSerializedScoreOperation'>,
  elementType: string | null | undefined,
  refreshKey: unknown,
) {
  const { score, performMutation, runSerializedScoreOperation } = core;
  // Values belong to the names they were read for: a selection of another type shows nothing until its read lands.
  const [loaded, setLoaded] = useState<{ key: string; values: Record<string, ElementPropertyState> }>({ key: '', values: {} });
  const [reload, setReload] = useState(0);
  const namesKey = notationPropertyNames(elementType).join(',');

  useEffect(() => {
    let cancelled = false;
    const read = score?.getElementPropertyValues;
    if (!score || !read || !namesKey) return;
    void runSerializedScoreOperation(() => read.call(score, namesKey.split(',')), 'read notation properties').then(
      (result) => !cancelled && setLoaded({ key: namesKey, values: result ?? {} }),
      () => !cancelled && setLoaded({ key: namesKey, values: {} }),
    );
    return () => {
      cancelled = true;
    };
  }, [score, namesKey, refreshKey, reload, runSerializedScoreOperation]);
  const values = namesKey && loaded.key === namesKey ? loaded.values : {};

  const set = useCallback(
    async (name: string, token: string | null) => {
      const write = score?.setElementPropertyValue;
      if (!score || !write) return;
      await performMutation(
        token === null ? `reset ${name}` : `edit ${name}`,
        () => Promise.resolve(write.call(score, name, token ?? '', token === null)),
        { skipWasmReselect: true, skipSelectionFallback: true },
      );
      setReload((n) => n + 1);
    },
    [score, performMutation],
  );

  const group = elementType ? NOTATION_PROPERTIES[elementType] : undefined;
  return { group, values, set, supported: Boolean(score?.getElementPropertyValues) };
}

export type NotationPropertiesModel = ReturnType<typeof useNotationProperties>;
