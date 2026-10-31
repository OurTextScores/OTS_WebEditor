import { useCallback, useEffect, useState } from 'react';
import type { ElementPropertyState } from '../../../lib/webmscore-loader';
import type { EditorCore } from '../core';
import {
  NOTATION_PROPERTIES,
  TEXT_PROPERTIES,
  TEXT_PROPERTY_NAMES,
  notationPropertyNames,
  type NotationPropertyDescriptor,
} from './notationProperties';

/**
 * The selection's typed notation properties (roadmap E09): read from the engine whenever the selection or the score
 * changes (`refreshKey`), and set as one undoable edit each. `set(name, null)` resets a property to its style default.
 */
export function useNotationProperties(
  core: Pick<EditorCore, 'score' | 'performMutation' | 'runSerializedScoreOperation'>,
  elementType: string | null | undefined,
  refreshKey: unknown,
): NotationPropertiesModel {
  const { score, performMutation, runSerializedScoreOperation } = core;
  // Values belong to the names they were read for: a selection of another type shows nothing until its read lands.
  const [loaded, setLoaded] = useState<{
    key: string;
    values: Record<string, ElementPropertyState>;
  }>({ key: '', values: {} });
  const [reload, setReload] = useState(0);
  // Text properties are asked of every selection: the engine reports only what the selected elements have.
  const namesKey = elementType
    ? [...notationPropertyNames(elementType), ...TEXT_PROPERTY_NAMES].join(',')
    : '';
  // The score's text styles, for the Text style choice: read once per score.
  const [textStyles, setTextStyles] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    const read = score?.getTextStyleCatalog;
    if (!score || !read) return;
    void runSerializedScoreOperation(() => read.call(score), 'read text styles').then(
      (catalog) =>
        !cancelled &&
        setTextStyles((catalog ?? []).map((entry) => ({ value: entry.type, label: entry.name }))),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [score, runSerializedScoreOperation]);

  useEffect(() => {
    let cancelled = false;
    const read = score?.getElementPropertyValues;
    if (!score || !read || !namesKey) return;
    void runSerializedScoreOperation(
      () => read.call(score, namesKey.split(',')),
      'read notation properties',
    ).then(
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
  return {
    group,
    text: TEXT_PROPERTIES,
    textStyles,
    values,
    set,
    supported: Boolean(score?.getElementPropertyValues),
  };
}

type PropertyGroup = {
  readonly title: string;
  readonly properties: readonly NotationPropertyDescriptor[];
};

export interface NotationPropertiesModel {
  /** The selection's element-specific properties (ornament, dynamic…), if its type has any. */
  group: PropertyGroup | undefined;
  /** Text properties, shown for whatever the selection has. */
  text?: PropertyGroup;
  /** The Text style choice's options: the score's text styles. */
  textStyles?: readonly { value: string; label: string }[];
  values: Record<string, ElementPropertyState>;
  set: (name: string, token: string | null) => Promise<void>;
  supported: boolean;
}
