import { useRegisterCommands } from '../../../lib/commands/useRegisterCommands';
import type { ChordSelectionInputs } from './chordSelection';
import { buildChordSelectionCommands } from './chordSelectionCommands';

/** Registers the chord-selection commands (roadmap E11) with the editor's live inputs. */
export function useChordSelection(inputs: ChordSelectionInputs) {
  // Made every render: useRegisterCommands keeps the latest behind stable registry entries.
  useRegisterCommands(
    'global',
    buildChordSelectionCommands(() => inputs),
  );
}
