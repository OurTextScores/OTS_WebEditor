import { useCallback, useRef, useState } from 'react';
import type { Score } from '@/lib/webmscore-loader';
import type { CompareScoreRole, CompareSide } from './compare-types';

type RoleRecord<T> = Record<CompareScoreRole, T>;

export type CompareEditCycleSnapshot = {
  baselines: RoleRecord<string | null>;
  editedRoles: CompareScoreRole[];
};

export type CompareMutationOptions = {
  side?: CompareSide;
  skipRelayout?: boolean;
  preserveKeyboardQueue?: boolean;
};

export type CompareMutationControllerOptions = {
  view: null | {
    currentXml: string;
    checkpointXml: string;
  };
  activeSide: CompareSide | null;
  leftScore: Score | null;
  rightScore: Score | null;
  liveScore: Score | null;
  swapBusy: boolean;
  feedbackBusy: boolean;
  beginBusy: () => void;
  endBusy: () => void;
  isBusy: () => boolean;
  isNoteInputCommitted: (role: CompareScoreRole) => boolean;
  setActiveSide: (side: CompareSide) => void;
  snapshotScore: (score: Score, fallbackXml: string | null) => Promise<string | null>;
  runSerialized: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  invalidateOperations: (invalidateQueuedKeyboard?: boolean) => number;
  isGenerationCurrent: (generation: number) => boolean;
  trackOperation: <T>(operation: Promise<T>) => Promise<T>;
  persistEdit: (
    score: Score,
    side: CompareSide,
    beforeXml: string,
    isCurrent: () => boolean,
  ) => Promise<string | null>;
  refreshLivePageCount: (score: Score) => Promise<void>;
  setAuxiliaryPageCount: (pageCount: number) => void;
  refreshNoteInputCursor: (
    score: Score,
    role: CompareScoreRole,
    side: CompareSide,
    isCurrent: () => boolean,
  ) => Promise<unknown>;
  reportError: (label: string, error: unknown) => void;
};

export function useCompareMutationController({
  view,
  activeSide,
  leftScore,
  rightScore,
  liveScore,
  swapBusy,
  feedbackBusy,
  beginBusy,
  endBusy,
  isBusy,
  isNoteInputCommitted,
  setActiveSide,
  snapshotScore,
  runSerialized,
  invalidateOperations,
  isGenerationCurrent,
  trackOperation,
  persistEdit,
  refreshLivePageCount,
  setAuxiliaryPageCount,
  refreshNoteInputCursor,
  reportError,
}: CompareMutationControllerOptions) {
  return useCallback(
    async (
      label: string,
      action: (targetScore: Score) => Promise<unknown> | unknown,
      options?: CompareMutationOptions,
    ) => {
      const side = options?.side ?? activeSide;
      const targetScore = side === 'left' ? leftScore : side === 'right' ? rightScore : null;
      if (!view || !side || !targetScore || isBusy() || swapBusy || feedbackBusy) {
        return false;
      }

      const generation = invalidateOperations(!options?.preserveKeyboardQueue);
      const isCurrent = () => isGenerationCurrent(generation);
      const role: CompareScoreRole = targetScore === liveScore ? 'current' : 'proposal';
      setActiveSide(side);
      beginBusy();

      const operation = trackOperation(
        (async () => {
          const fallbackXml = role === 'current' ? view.currentXml : view.checkpointXml;
          const beforeXml = await snapshotScore(targetScore, fallbackXml);
          if (!isCurrent()) {
            return false;
          }
          if (!beforeXml) {
            throw new Error('Unable to snapshot the compare score before editing.');
          }
          const result = await runSerialized(
            () => Promise.resolve(action(targetScore)),
            `compare-edit:${label}`,
          );
          if (!isCurrent() || result === false) {
            return false;
          }
          if (!options?.skipRelayout && targetScore.relayout) {
            await runSerialized(
              () => Promise.resolve(targetScore.relayout!()),
              `compare-relayout:${label}`,
            );
            if (!isCurrent()) {
              return false;
            }
          }
          if (role === 'current') {
            await refreshLivePageCount(targetScore);
          } else if (targetScore.npages) {
            const pages = await runSerialized(
              () => Promise.resolve(targetScore.npages!()),
              'npages(compare-edit)',
            );
            if (!isCurrent()) {
              return false;
            }
            setAuxiliaryPageCount(Math.max(1, pages));
          }
          const persistedXml = await persistEdit(targetScore, side, beforeXml, isCurrent);
          if (!persistedXml || !isCurrent()) {
            return false;
          }
          if (isNoteInputCommitted(role)) {
            await refreshNoteInputCursor(targetScore, role, side, isCurrent);
          }
          return isCurrent();
        })(),
      );

      try {
        return await operation;
      } catch (error) {
        if (!isCurrent()) {
          return false;
        }
        reportError(label, error);
        return false;
      } finally {
        endBusy();
      }
    },
    [
      activeSide,
      beginBusy,
      endBusy,
      feedbackBusy,
      invalidateOperations,
      isBusy,
      isGenerationCurrent,
      isNoteInputCommitted,
      leftScore,
      liveScore,
      persistEdit,
      refreshLivePageCount,
      refreshNoteInputCursor,
      reportError,
      rightScore,
      runSerialized,
      setActiveSide,
      setAuxiliaryPageCount,
      snapshotScore,
      swapBusy,
      trackOperation,
      view,
    ],
  );
}

const emptyRoleRecord = <T>(value: T): RoleRecord<T> => ({
  current: value,
  proposal: value,
  // Two-pane comparators never key anything here; the scanner's merged score
  // does, and keying it by role is what keeps its editing state from being
  // confused with either engine's.
  merged: value,
});

export function useCompareEditing<TSelection, TCursor>() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [editedRoles, setEditedRoles] = useState<CompareScoreRole[]>([]);
  const baselinesRef = useRef<RoleRecord<string | null>>(emptyRoleRecord(null));
  const [noteInputByRole, setNoteInputByRole] = useState<RoleRecord<boolean>>(
    emptyRoleRecord(false),
  );
  const noteInputByRoleRef = useRef<RoleRecord<boolean>>(emptyRoleRecord(false));
  const noteInputDesiredByRoleRef = useRef<RoleRecord<boolean>>(emptyRoleRecord(false));
  const [noteInputCursorByRole, setNoteInputCursorByRole] = useState<RoleRecord<TCursor | null>>(
    emptyRoleRecord(null),
  );
  const [hasSelectionByRole, setHasSelectionByRole] = useState<RoleRecord<boolean>>(
    emptyRoleRecord(false),
  );
  const [selectionBoxesByRole, setSelectionBoxesByRole] = useState<RoleRecord<TSelection[]>>(
    emptyRoleRecord([]),
  );

  const beginBusy = useCallback(() => {
    busyRef.current = true;
    setBusy(true);
  }, []);

  const endBusy = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  const isBusy = useCallback(() => busyRef.current, []);

  const recordEdit = useCallback((role: CompareScoreRole, beforeXml: string, afterXml: string) => {
    const baseline = baselinesRef.current[role] ?? beforeXml;
    if (afterXml === baseline) {
      baselinesRef.current = { ...baselinesRef.current, [role]: null };
      setEditedRoles((previous) => previous.filter((entry) => entry !== role));
      return;
    }
    baselinesRef.current = { ...baselinesRef.current, [role]: baseline };
    setEditedRoles((previous) => (previous.includes(role) ? previous : [...previous, role]));
  }, []);

  const getBaseline = useCallback((role: CompareScoreRole) => baselinesRef.current[role], []);

  const captureEditCycle = useCallback(
    (): CompareEditCycleSnapshot => ({
      baselines: { ...baselinesRef.current },
      editedRoles: [...editedRoles],
    }),
    [editedRoles],
  );

  const clearEditCycle = useCallback(() => {
    baselinesRef.current = emptyRoleRecord(null);
    setEditedRoles([]);
  }, []);

  const restoreEditCycle = useCallback((snapshot: CompareEditCycleSnapshot) => {
    baselinesRef.current = { ...snapshot.baselines };
    setEditedRoles([...snapshot.editedRoles]);
  }, []);

  const requestNoteInput = useCallback((role: CompareScoreRole, enabled: boolean) => {
    noteInputDesiredByRoleRef.current = {
      ...noteInputDesiredByRoleRef.current,
      [role]: enabled,
    };
  }, []);

  const commitNoteInput = useCallback((role: CompareScoreRole, enabled: boolean) => {
    noteInputByRoleRef.current = { ...noteInputByRoleRef.current, [role]: enabled };
    noteInputDesiredByRoleRef.current = {
      ...noteInputDesiredByRoleRef.current,
      [role]: enabled,
    };
    setNoteInputByRole(noteInputByRoleRef.current);
    if (!enabled) {
      setNoteInputCursorByRole((previous) => ({ ...previous, [role]: null }));
    }
  }, []);

  const rollbackNoteInputRequest = useCallback((role: CompareScoreRole) => {
    noteInputDesiredByRoleRef.current = {
      ...noteInputDesiredByRoleRef.current,
      [role]: noteInputByRoleRef.current[role],
    };
  }, []);

  const isNoteInputCommitted = useCallback(
    (role: CompareScoreRole) => noteInputByRoleRef.current[role],
    [],
  );

  const isNoteInputDesired = useCallback(
    (role: CompareScoreRole) => noteInputDesiredByRoleRef.current[role],
    [],
  );

  const setNoteInputCursor = useCallback((role: CompareScoreRole, cursor: TCursor | null) => {
    setNoteInputCursorByRole((previous) => ({ ...previous, [role]: cursor }));
  }, []);

  const setSelection = useCallback(
    (role: CompareScoreRole, boxes: TSelection[], selected = boxes.length > 0) => {
      setSelectionBoxesByRole((previous) => ({ ...previous, [role]: boxes }));
      setHasSelectionByRole((previous) => ({ ...previous, [role]: selected }));
    },
    [],
  );

  const setHasSelection = useCallback((role: CompareScoreRole, selected: boolean) => {
    setHasSelectionByRole((previous) => ({ ...previous, [role]: selected }));
  }, []);

  const resetRole = useCallback((role: CompareScoreRole) => {
    noteInputByRoleRef.current = { ...noteInputByRoleRef.current, [role]: false };
    noteInputDesiredByRoleRef.current = { ...noteInputDesiredByRoleRef.current, [role]: false };
    setNoteInputByRole(noteInputByRoleRef.current);
    setNoteInputCursorByRole((previous) => ({ ...previous, [role]: null }));
    setSelectionBoxesByRole((previous) => ({ ...previous, [role]: [] }));
    setHasSelectionByRole((previous) => ({ ...previous, [role]: false }));
  }, []);

  const resetAll = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
    baselinesRef.current = emptyRoleRecord(null);
    setEditedRoles([]);
    noteInputByRoleRef.current = emptyRoleRecord(false);
    noteInputDesiredByRoleRef.current = emptyRoleRecord(false);
    setNoteInputByRole(emptyRoleRecord(false));
    setNoteInputCursorByRole(emptyRoleRecord(null));
    setHasSelectionByRole(emptyRoleRecord(false));
    setSelectionBoxesByRole(emptyRoleRecord([]));
  }, []);

  return {
    state: {
      busy,
      editedRoles,
      noteInputByRole,
      noteInputCursorByRole,
      hasSelectionByRole,
      selectionBoxesByRole,
    },
    beginBusy,
    captureEditCycle,
    clearEditCycle,
    commitNoteInput,
    endBusy,
    getBaseline,
    isBusy,
    isNoteInputCommitted,
    isNoteInputDesired,
    recordEdit,
    requestNoteInput,
    resetAll,
    resetRole,
    restoreEditCycle,
    rollbackNoteInputRequest,
    setHasSelection,
    setNoteInputCursor,
    setSelection,
  };
}
