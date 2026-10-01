import { useLayoutEffect, useMemo } from 'react';
import { useRegisterCommands } from '../../lib/commands';
import { useLatestCallbackFacade } from '../../lib/use-latest-callback-facade';
import { setRecentScores } from '../shell/shellStore';
import { buildShellEditorCommands, type ShellEditorBindings } from './shellCommands';

/**
 * Registers the commands that need `ScoreEditor`'s state and publishes the recent-scores
 * list the File menu shows. Built once; commands read the latest bindings when they run.
 */
export function useShellCommands(bindings: ShellEditorBindings): void {
  const [getBindings, bindingsRef] = useLatestCallbackFacade<() => ShellEditorBindings>(
    () => bindings,
  );
  useLayoutEffect(() => {
    bindingsRef.current = () => bindings;
  });

  const commands = useMemo(() => buildShellEditorCommands(getBindings), [getBindings]);
  useRegisterCommands('global', commands);

  const { scoreSummaries } = bindings;
  useLayoutEffect(() => {
    // The newest ten, as File ▸ Open Recent shows them; the list is already newest-first.
    setRecentScores(
      scoreSummaries.slice(0, 10).map(({ scoreId, title, lastUpdated }) => ({
        scoreId,
        title,
        lastUpdated,
      })),
    );
  }, [scoreSummaries]);
}
