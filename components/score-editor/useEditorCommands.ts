import { useLayoutEffect, useMemo } from 'react';
import { useProvideCommandContext, useRegisterCommands } from '../../lib/commands';
import { useLatestCallbackFacade } from '../../lib/use-latest-callback-facade';
import type { EditorCommandProps } from './editorProps';
import { buildEditorCommands, deriveRibbonCommandContext } from './editorCommands';

/**
 * Registers every editor action as a command and supplies the context they evaluate
 * against. The command list is built once; each command reads the latest props through a
 * stable facade when it runs, so handlers that change identity every render need no
 * re-registration.
 */
export function useEditorCommands(props: EditorCommandProps): void {
  const [getProps, propsRef] = useLatestCallbackFacade<() => EditorCommandProps>(() => props);
  useLayoutEffect(() => {
    propsRef.current = () => props;
  });

  const commands = useMemo(() => buildEditorCommands(getProps), [getProps]);
  useRegisterCommands('global', commands);

  // Rebuilt every render, but `useProvideCommandContext` compares field by field and only
  // invalidates the registry when something actually changed.
  useProvideCommandContext(deriveRibbonCommandContext(props));
}
