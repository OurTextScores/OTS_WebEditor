import { useCallback } from 'react';
import type { Score } from '@/lib/webmscore-loader';
import type { CompareScoreRole, CompareSide } from './compare-types';

export type NoteInputCursorRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  voice: number;
};

/**
 * Validates and normalizes a raw cursor rect read from the engine.
 *
 * The engine reports a cursor even when it has no meaningful geometry (between
 * scores, mid-relayout, or on a build that returns a zeroed struct), and a
 * degenerate rect painted as an overlay reads to the user as a stuck cursor. Returns
 * null when the rect cannot be trusted rather than clamping it into something
 * plausible.
 */
export function normalizeNoteInputCursor(cursor: unknown): NoteInputCursorRect | null {
  if (!cursor || typeof cursor !== 'object') {
    return null;
  }
  const raw = cursor as Partial<Record<keyof NoteInputCursorRect, unknown>>;
  const numeric = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const page = numeric(raw.page);
  const x = numeric(raw.x);
  const y = numeric(raw.y);
  const width = numeric(raw.width);
  const height = numeric(raw.height);
  if (page === null || x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  const voice = numeric(raw.voice) ?? 0;
  return {
    page: Math.max(0, Math.floor(page)),
    x,
    y,
    width,
    height,
    voice: Math.min(3, Math.max(0, Math.floor(voice))),
  };
}

type PersistenceOptions = {
  getRole: (score: Score) => CompareScoreRole;
  getFallbackXml: (role: CompareScoreRole) => string | null;
  exportXml: (score: Score, fallbackXml: string | null) => Promise<string | null>;
  runSerialized: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
  recordEdit: (role: CompareScoreRole, beforeXml: string, afterXml: string) => void;
  setNoteInputCursor: (role: CompareScoreRole, cursor: NoteInputCursorRect | null) => void;
  /** Role-specific commit of the exported XML into app state. */
  commitProposalXml: (afterXml: string) => void;
  commitCurrentXml: (afterXml: string) => Promise<void>;
  /**
   * Re-renders the main editor sitting underneath the compare modal, so it is already
   * current when the modal closes. Current-role edits only, and deliberately not on the
   * byte-identical path, which changed no document the editor could be showing.
   */
  renderLiveEditor: (score: Score) => Promise<unknown>;
  renderEditedScore: (
    score: Score,
    side: CompareSide,
    highlightSelection?: boolean,
  ) => Promise<void>;
  refreshSelectionGeometry: (
    score: Score,
    role: CompareScoreRole,
    side: CompareSide,
    isCurrent: () => boolean,
  ) => Promise<unknown>;
  bumpAlignmentRevision: () => void;
};

/**
 * Owns what happens after a compare mutation has already run in the engine: export,
 * edit-diff bookkeeping, role-specific state commit, re-render, selection geometry, and
 * alignment. Generation is rechecked after every await so a lifecycle transition part-way
 * through cannot publish a stale export.
 */
export function useComparePersistence({
  getRole,
  getFallbackXml,
  exportXml,
  runSerialized,
  recordEdit,
  setNoteInputCursor,
  commitProposalXml,
  commitCurrentXml,
  renderLiveEditor,
  renderEditedScore,
  refreshSelectionGeometry,
  bumpAlignmentRevision,
}: PersistenceOptions) {
  const refreshNoteInputCursor = useCallback(
    async (
      targetScore: Score,
      role: CompareScoreRole,
      side: CompareSide,
      isCurrent: () => boolean = () => true,
    ) => {
      if (!targetScore.getNoteInputCursorRect) {
        if (isCurrent()) {
          setNoteInputCursor(role, null);
        }
        return null;
      }
      try {
        const cursor = await runSerialized(
          () => Promise.resolve(targetScore.getNoteInputCursorRect!()),
          `compare-note-input-cursor:${side}`,
        );
        if (!isCurrent()) {
          return null;
        }
        const normalized = normalizeNoteInputCursor(cursor);
        setNoteInputCursor(role, normalized);
        return normalized;
      } catch (err) {
        if (isCurrent()) {
          console.warn(`Failed to read ${side} compare note input cursor geometry:`, err);
          setNoteInputCursor(role, null);
        }
        return null;
      }
    },
    [runSerialized, setNoteInputCursor],
  );

  const persistEdit = useCallback(
    async (
      targetScore: Score,
      side: CompareSide,
      beforeXml: string,
      isCurrentGeneration: () => boolean,
    ) => {
      const role = getRole(targetScore);
      const afterXml = await exportXml(targetScore, getFallbackXml(role));
      if (!isCurrentGeneration()) {
        return null;
      }
      if (!afterXml) {
        throw new Error('Unable to export the edited compare score.');
      }

      // An edit that leaves the document byte-identical (a selection-only operation,
      // or a mutation the engine rejected) must not create a manual-edit diff, but the
      // pane still has to re-render and re-measure.
      if (afterXml === beforeXml) {
        await renderEditedScore(targetScore, side, true);
        if (!isCurrentGeneration()) {
          return null;
        }
        await refreshSelectionGeometry(targetScore, role, side, isCurrentGeneration);
        return isCurrentGeneration() ? afterXml : null;
      }

      recordEdit(role, beforeXml, afterXml);
      if (role === 'proposal') {
        commitProposalXml(afterXml);
      } else {
        await commitCurrentXml(afterXml);
        if (!isCurrentGeneration()) {
          return null;
        }
        await renderLiveEditor(targetScore);
      }
      if (!isCurrentGeneration()) {
        return null;
      }
      await renderEditedScore(targetScore, side, true);
      if (!isCurrentGeneration()) {
        return null;
      }
      await refreshSelectionGeometry(targetScore, role, side, isCurrentGeneration);
      if (!isCurrentGeneration()) {
        return null;
      }
      bumpAlignmentRevision();
      return afterXml;
    },
    [
      bumpAlignmentRevision,
      commitCurrentXml,
      commitProposalXml,
      exportXml,
      renderLiveEditor,
      getFallbackXml,
      getRole,
      recordEdit,
      refreshSelectionGeometry,
      renderEditedScore,
    ],
  );

  return { persistEdit, refreshNoteInputCursor };
}
