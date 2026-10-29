import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultCommandRegistry } from '../../../lib/commands/registry';
import type { Score } from '../../../lib/webmscore-loader';
import { pruneMenuNodes } from '../../shell/menuTree';
import type { ScoreClickOutcome } from '../canvas';
import type { SelectionBox } from '../selection-types';
import type { SimilarPattern } from '../commands';
import {
  contextFromReport,
  contextMenuFor,
  hitTypeAfterSelect,
  isEditableType,
  keepsSelectionOnRightClick,
  menuTypeFor,
  pointInBoxes,
  svgHitAt,
  type EngineSelection,
  type ResolvedContext,
  type ScoreContextMenuState,
} from './contextMenus';

export interface ScoreContextMenuInputs {
  readonly score: Score | null;
  /** The main score is interactive: loaded, editable, and not in a compare session. */
  readonly enabled: boolean;
  readonly noteInputActiveRef: React.RefObject<boolean>;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly selectionBoxes: readonly SelectionBox[];
  /** The selection boxes are the engine's range rectangles (a bar or range is selected). */
  readonly hasBackendHighlighting: boolean;
  /** A text element is open in the inline editor. */
  readonly textEditing: boolean;
  readonly clientToScorePoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** A client point as the engine hit-tests it: its page and page-relative engraving coordinates. */
  readonly engravingPointAt: (clientX: number, clientY: number, target: Element | null) => SimilarPattern | null;
  /** Note input's right-click (MuseScore's remove-note); absent where the engine lacks it or editing is off. */
  readonly removeNoteAtPoint?: (page: number, x: number, y: number) => Promise<unknown>;
  /** Makes a client point on `page` the editor's remembered selection point (what commands re-project). */
  readonly rememberSelectionPoint: (page: number, clientX: number, clientY: number) => void;
  /** The left-click selection path in its right-button mode (`score-click.ts`). */
  readonly selectForContextMenu: (event: React.MouseEvent) => Promise<ScoreClickOutcome>;
  readonly runSerializedScoreOperation: <T>(operation: () => Promise<T>, label: string) => Promise<T>;
}

/** Where the selection is on screen: its first drawn element, as MuseScore opens at `selectionElementPos()`. */
function selectionAnchor(container: HTMLElement | null): { x: number; y: number } | null {
  const selected = container?.querySelector('svg .selected');
  if (selected) {
    const rect = selected.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * The score's right-click menu (design doc Part C2): selects as MuseScore's right button does,
 * picks the menu from what was hit, and opens it at the pointer; or, from the keyboard
 * (Shift+F10, the Menu key), at the selection.
 */
export function useScoreContextMenu(inputs: ScoreContextMenuInputs) {
  const [menu, setMenu] = useState<ScoreContextMenuState | null>(null);
  // Handlers read the latest inputs when they run, so they keep one identity.
  const latest = useRef(inputs);
  useLayoutEffect(() => {
    latest.current = inputs;
  });
  // A newer right-click supersedes one still waiting on the engine.
  const generation = useRef(0);

  const close = useCallback(() => setMenu(null), []);

  const readEngineSelection = useCallback(async (): Promise<EngineSelection> => {
    const { score, runSerializedScoreOperation } = latest.current;
    if (!score) return { kind: 'none', type: null };
    return runSerializedScoreOperation(async () => {
      const [range, properties] = await Promise.all([
        Promise.resolve(score.isSelectionRange?.()),
        Promise.resolve(score.getSelectedElementProperties?.()),
      ]);
      const count = properties?.selectionCount ?? 0;
      const kind = range ? 'range' : count === 0 ? 'none' : count === 1 ? 'single' : 'list';
      const type =
        kind === 'single' && properties?.elementType && properties.elementType !== 'Mixed'
          ? properties.elementType
          : null;
      return { kind, type } as const;
    }, 'read selection for context menu');
  }, []);

  /** The Phase 1 reading, for an engine without `contextHitAtPoint`: the SVG's classes and the selection. */
  const resolveFromSvg = useCallback(
    async (event: React.MouseEvent, run: number): Promise<ResolvedContext | null> => {
      const inputs = latest.current;
      const hit = svgHitAt(event.target as Element | null);
      const insideRange =
        inputs.hasBackendHighlighting &&
        pointInBoxes(inputs.clientToScorePoint(event.clientX, event.clientY), inputs.selectionBoxes);
      let hitType: string | null;
      if (keepsSelectionOnRightClick(hit, insideRange)) {
        hitType = hit.type ?? (insideRange ? 'Measure' : null);
      } else {
        const outcome = await inputs.selectForContextMenu(event);
        if (outcome === 'ignored' || run !== generation.current) return null;
        hitType =
          outcome === 'selected'
            ? hitTypeAfterSelect(hit, await readEngineSelection())
            : outcome === 'seek'
              ? hit.type
              : null;
      }
      const selection = await readEngineSelection();
      return { hitType, selection, editable: isEditableType(hitType ?? selection.type) };
    },
    [readEngineSelection],
  );

  /**
   * The engine's reading (`contextHitAtPoint`): what is under the point and whether it is already
   * selected. A hit that is not selected is selected as a left click would; a miss keeps the selection.
   */
  const resolveFromEngine = useCallback(
    async (event: React.MouseEvent, run: number, at: SimilarPattern): Promise<ResolvedContext | null> => {
      const { score, runSerializedScoreOperation, selectForContextMenu } = latest.current;
      if (!score?.contextHitAtPoint) return null;
      const readHit = () =>
        runSerializedScoreOperation(
          () => score.contextHitAtPoint!(at.page, at.x, at.y),
          'read context menu hit',
        );
      let report = await readHit();
      if (report.hit && !report.hit.selected) {
        const outcome = await selectForContextMenu(event);
        if (outcome === 'ignored' || run !== generation.current) return null;
        if (outcome === 'selected') report = await readHit();
      }
      // Commands re-project the editor's remembered selection point into the engine. After an edit
      // (a hairpin just added) or a click on an element the SVG cannot resolve, that point can be a
      // different element's, so make it the point the engine just resolved to this one.
      if (report.hit && report.hit.selected && report.selection.kind === 'single') {
        latest.current.rememberSelectionPoint(at.page, event.clientX, event.clientY);
      }
      const context = contextFromReport(report);
      // No hit: MuseScore's currentElement() falls back to the single selection, so Edit Element
      // follows whether that element edits.
      if (!report.hit && report.selection.kind === 'single' && score.contextSelectionInfo) {
        const selected = await runSerializedScoreOperation(
          () => score.contextSelectionInfo!(),
          'read context menu selection',
        );
        return { ...context, editable: selected.hit?.editable ?? false };
      }
      return context;
    },
    [],
  );

  const show = useCallback(
    (
      x: number,
      y: number,
      context: ResolvedContext,
      pointer?: { editAt: { clientX: number; clientY: number }; similarAt: SimilarPattern | null },
    ) => {
      const tree = contextMenuFor({
        menuType: menuTypeFor(context.hitType, context.selection),
        selection: context.selection,
        editable: context.editable,
        textEditing: latest.current.textEditing,
        editAt: pointer?.editAt,
        similarAt: pointer?.similarAt ?? undefined,
        flags: context.flags,
        drumStaff: context.drumStaff,
        staffIdx: context.staffIdx,
      });
      const nodes = pruneMenuNodes(tree, defaultCommandRegistry);
      // Nothing to offer (blank paper, until OTS has page settings): no menu at all.
      setMenu(nodes.length > 0 ? { x, y, nodes } : null);
    },
    [],
  );

  const openAtSelection = useCallback(async () => {
    const { enabled, containerRef, score, runSerializedScoreOperation } = latest.current;
    if (!enabled || !score) return;
    const run = ++generation.current;
    const anchor = selectionAnchor(containerRef.current);
    if (!anchor) return;
    let context: ResolvedContext;
    if (score.contextSelectionInfo) {
      const report = await runSerializedScoreOperation(
        () => score.contextSelectionInfo!(),
        'read context menu selection',
      );
      context = contextFromReport(report);
    } else {
      const selection = await readEngineSelection();
      context = { hitType: null, selection, editable: isEditableType(selection.type) };
    }
    if (run !== generation.current) return;
    show(anchor.x, anchor.y, context);
  }, [readEngineSelection, show]);

  const openFromPointer = useCallback(
    async (event: React.MouseEvent) => {
      const target = event.target as Element | null;
      // Native editing menus stay native inside the inline text editor.
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      const inputs = latest.current;
      if (!inputs.enabled || !inputs.score) return;
      // MuseScore's right-click in note input removes the note there (a rest takes its place), and no menu opens.
      if (inputs.noteInputActiveRef.current) {
        const at = inputs.engravingPointAt(event.clientX, event.clientY, target);
        if (at) await inputs.removeNoteAtPoint?.(at.page, at.x, at.y);
        return;
      }
      // The Menu key and Shift+F10 arrive here as a pointerless contextmenu event.
      if ((event.nativeEvent as PointerEvent).pointerType === '') {
        await openAtSelection();
        return;
      }

      const run = ++generation.current;
      const { clientX: x, clientY: y } = event;
      const at = inputs.engravingPointAt(x, y, target);
      const context =
        at && inputs.score.contextHitAtPoint
          ? await resolveFromEngine(event, run, at)
          : await resolveFromSvg(event, run);
      if (!context || run !== generation.current) return;
      const pattern = context.hitType && context.hitType !== 'Measure' ? at : null;
      show(x, y, context, { editAt: { clientX: x, clientY: y }, similarAt: pattern });
    },
    [openAtSelection, resolveFromEngine, resolveFromSvg, show],
  );

  // A menu pinned to a point on the screen would float away from the score as it scrolls.
  useEffect(() => {
    if (!menu) return;
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      const content = document.querySelector('[data-testid="score-context-menu"]');
      if (content && target && content.contains(target)) return;
      setMenu(null);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [menu]);

  return { menu, close, openFromPointer, openAtSelection };
}
