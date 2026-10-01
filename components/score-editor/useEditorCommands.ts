import { useLayoutEffect, useMemo } from 'react';
import { useProvideCommandContext, useRegisterCommands } from '../../lib/commands';
import { useLatestCallbackFacade } from '../../lib/use-latest-callback-facade';
import type { ToolbarSectionProps } from '../toolbar/types';
import { buildEditorCommands, deriveRibbonCommandContext } from './editorCommands';

/**
 * Registers every ribbon action as a command and supplies the context they evaluate
 * against. The command list is built once; each command reads the latest props through a
 * stable facade when it runs, so handlers that change identity every render need no
 * re-registration.
 *
 * Phase 0 calls this from `Toolbar`, which already receives every handler. Phase 1 moves
 * the call to `ScoreEditor` and the ribbon starts reading the registry instead.
 */
export function useEditorCommands(props: ToolbarSectionProps): void {
  const [getProps, propsRef] = useLatestCallbackFacade<() => ToolbarSectionProps>(() => props);
  useLayoutEffect(() => {
    propsRef.current = () => props;
  });

  const commands = useMemo(() => buildEditorCommands(getProps), [getProps]);
  useRegisterCommands('global', commands);

  // Rebuilt every render, but `useProvideCommandContext` compares field by field and only
  // invalidates the registry when something actually changed.
  useProvideCommandContext(deriveRibbonCommandContext(props));
}
