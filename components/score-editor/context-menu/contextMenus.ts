import type { CommandId } from '../../../lib/commands/types';
import type { ContextHitReport } from '../../../lib/webmscore-loader';
import type { MenuNode } from '../../shell/menus';

/**
 * The score's right-click menu, as MuseScore 4.7 builds it
 * (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Part A). Pure: what was hit and
 * what is selected in, a menu tree of command ids out. Labels, shortcuts and enablement come
 * from the registry, and `pruneMenuNodes` drops what OTS has not registered yet, so the tree
 * names MuseScore's full menu and shows what exists.
 */

/** An open menu: where it opens, in client coordinates, and what it holds. */
export interface ScoreContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly nodes: readonly MenuNode[];
}

/** What the engine reports about its selection, read after the right-click has selected. */
export interface EngineSelection {
  readonly kind: 'none' | 'single' | 'list' | 'range';
  /** Engine type name of a single selected element (`typeName()`), else null. */
  readonly type: string | null;
}

/** The engine type names the menus distinguish (`TConv::toXml(ElementType)`). */
const MEASURE = 'Measure';
const PAGE = 'Page';

/**
 * Which menu to show: the hit element's type, else the selection's (`selectionType()`,
 * notationviewinputcontroller.cpp). A range counts as a bar, nothing as the page.
 */
export function menuTypeFor(hitType: string | null, selection: EngineSelection): string {
  if (hitType) return hitType;
  if (selection.kind === 'range') return MEASURE;
  if (selection.kind === 'single' && selection.type) return selection.type;
  return PAGE;
}

/**
 * Elements MuseScore will not open for editing (`isEditable()` overrides returning false);
 * everything else is editable unless generated, which the SVG does not say. The engine's own
 * answer replaces this list once the bridge reports it (design doc, Phase 2).
 */
const NOT_EDITABLE = new Set([
  'Clef',
  'InstrumentName',
  'MeasureNumber',
  'MMRestRange',
  'GuitarBend',
  'HarpPedalDiagram',
  'StaffLines',
  MEASURE,
  PAGE,
]);

export const isEditableType = (type: string | null): boolean =>
  Boolean(type) && !NOT_EDITABLE.has(type!);

/** What the menu is about: the inputs `NotationContextMenuModel` reads. */
export interface ContextMenuTarget {
  /** `menuTypeFor`'s answer. */
  readonly menuType: string;
  readonly selection: EngineSelection;
  /** The element the menu is about (hit, else the single selection) is editable. */
  readonly editable: boolean;
  /** A text element is open for editing; the menu stops after the clipboard block. */
  readonly textEditing: boolean;
  /** Where the right-click was, for Edit Element to act on what was clicked; absent from the keyboard. */
  readonly editAt?: { readonly clientX: number; readonly clientY: number };
  /** The right-clicked element's page point: Select ▸ Similar's pattern (MuseScore's last hit). */
  readonly similarAt?: { readonly page: number; readonly x: number; readonly y: number };
  /** The per-type conditions the engine reports (fret box, linked diagram, snaps, barline text). */
  readonly flags?: ContextFlags;
  /** The hit staff's instrument has a drumset: MuseScore adds Customize kit… to the bar menu. */
  readonly drumStaff?: boolean;
}

export type ContextFlags = NonNullable<ContextHitReport['hit']>['flags'];

const item = (id: CommandId, label?: string, extra: Partial<MenuNode> = {}): MenuNode =>
  ({ kind: 'item', id, ...(label ? { label } : {}), ...extra }) as MenuNode;
const submenu = (label: string, ...children: MenuNode[]): MenuNode => ({
  kind: 'submenu',
  label,
  children,
});
const separator: MenuNode = { kind: 'separator' };

/** `makeDefaultCopyPasteItems` without Delete, which the measure menu retitles. */
const clipboardItems = (): MenuNode[] => [
  item('edit.cut'),
  item('edit.copy'),
  item('edit.paste'),
  item('edit.swapClipboard'),
];

/** `makeSelectItems`: by selection shape; an empty submenu is pruned. */
function selectItems(target: ContextMenuTarget): MenuNode[] {
  const at = target.similarAt ? { arg: target.similarAt } : {};
  const more = item('edit.select.more', 'More', {
    arg: { at: target.similarAt, note: target.menuType === 'Note' },
  });
  if (target.selection.kind === 'single') {
    return [
      item('edit.select.similar', 'Similar', at),
      item('edit.select.similarStaff', 'Similar on This Staff', at),
      more,
    ];
  }
  if (target.selection.kind === 'range') {
    return [item('edit.select.similarRange', 'Similar in This Range', at), more];
  }
  return [more];
}

/** `makeElementItems`: the menu for every type without one of its own. */
function elementItems(target: ContextMenuTarget): MenuNode[] {
  const items = [...clipboardItems(), item('edit.delete')];
  if (target.textEditing) return items;
  items.push(submenu('Select', ...selectItems(target)));
  if (target.editable) {
    items.push(separator, item('edit.element', undefined, target.editAt ? { arg: target.editAt } : {}));
  }
  items.push(separator, item('format.style'));
  return items;
}

/** `makeMeasureItems`. Customize kit and Measure properties have no OTS counterpart yet. */
function measureItems(target: ContextMenuTarget): MenuNode[] {
  return [
    ...clipboardItems(),
    separator,
    item('edit.delete', 'Clear Measures'),
    item('tools.measures.removeSelected', 'Delete Measures'),
    separator,
    ...(target.drumStaff ? [item('instruments.customizeKit')] : []),
    item('instruments.staffProperties'),
    separator,
    submenu(
      'Insert Measures',
      item('add.measures', 'After Selection', { formDefaults: { target: 'after-selection' } }),
      item('add.measures', 'Before Selection', { formDefaults: { target: 'before-selection' } }),
      separator,
      item('add.measures', 'At Start of Score', { formDefaults: { target: 'beginning' } }),
      item('add.measures', 'At End of Score', { formDefaults: { target: 'end' } }),
    ),
    // MuseScore offers these in Page view only; the OTS editor is always in Page view.
    submenu(
      'Move Measures',
      item('format.measure.toPrevSystem', 'To Previous System'),
      item('format.measure.toNextSystem', 'To Next System'),
    ),
    item('format.system.fromSelection'),
    separator,
    item('measure.properties'),
  ];
}

/** `makePageItems`. None exist in OTS yet, so the page has no menu (design doc, decisions). */
function pageItems(): MenuNode[] {
  return [item('format.style'), item('format.pageSettings'), item('format.loadStyle')];
}

/** The element menu, then MuseScore's type-specific entries after a separator. */
const elementThen = (target: ContextMenuTarget, ...extra: MenuNode[]): MenuNode[] => [
  ...elementItems(target),
  separator,
  ...extra,
];

/** `makeElementInFretBoxItems`: a chord symbol or diagram in a fretboard-diagram frame. */
function fretBoxItems(target: ContextMenuTarget): MenuNode[] {
  return [
    item('edit.copy'),
    item('edit.delete', 'Hide'),
    separator,
    submenu('Select', ...selectItems(target)),
    separator,
    item('format.style'),
  ];
}

/** `makeHarmonyItems`. Realize chord symbols needs its options dialog, not in OTS yet. */
function harmonyItems(target: ContextMenuTarget): MenuNode[] {
  if (target.flags?.inFretBox) return fretBoxItems(target);
  return elementThen(
    target,
    ...(target.flags?.harmonyHasFretDiagram
      ? []
      : [item('add.fretboardForHarmony', 'Add Fretboard Diagram')]),
    item('tools.realizeHarmony'),
  );
}

/** `makeFretboardDiagramItems`. */
function fretDiagramItems(target: ContextMenuTarget): MenuNode[] {
  if (target.flags?.inFretBox) return fretBoxItems(target);
  if (target.flags?.fretHasHarmony) return elementItems(target);
  return elementThen(target, item('add.text.harmony', 'Add Chord Symbol', { arg: 0 }));
}

/** `makeVerticalBoxItems` / `makeHorizontalBoxItems`: Add ▸ texts (all for a vertical frame) and an image. */
function frameItems(target: ContextMenuTarget, vertical: boolean): MenuNode[] {
  const texts = (vertical ? [0, 1, 2, 3, 4, 5] : [0]).map((kind) => item('add.frameText', undefined, { arg: kind }));
  return elementThen(target, submenu('Add', ...texts, item('add.image')));
}

/** `makeHairpinItems` / `makeGradualTempoChangeItems`: the snaps, for one selected line only. */
function snapItems(target: ContextMenuTarget, previous: boolean): MenuNode[] {
  if (target.selection.kind !== 'single') return elementItems(target);
  return elementThen(
    target,
    ...(previous
      ? [item('format.snap.previous', undefined, { checked: Boolean(target.flags?.snapBefore) })]
      : []),
    item('format.snap.next', undefined, { checked: Boolean(target.flags?.snapAfter) }),
  );
}

/** `makeTextItems`: a play-count text on a barline gets only Select ▸ and Style…. */
function textItems(target: ContextMenuTarget): MenuNode[] {
  if (!target.flags?.parentIsBarline) return elementItems(target);
  if (target.textEditing) return [];
  return [submenu('Select', ...selectItems(target)), separator, item('format.style')];
}

/**
 * `makeItemsByElementType`. The "…Properties" dialogs MuseScore opens are the Properties panel in
 * OTS until they exist (design doc, decision 3).
 */
export function contextMenuFor(target: ContextMenuTarget): MenuNode[] {
  switch (target.menuType) {
    case MEASURE:
      return measureItems(target);
    case PAGE:
      return pageItems();
    case 'StaffText':
      return elementThen(target, item('format.elementProperties', 'Staff Text Properties'));
    case 'SystemText':
    case 'TripletFeel':
      return elementThen(target, item('format.elementProperties', 'System Text Properties'));
    case 'TimeSig':
      return elementThen(target, item('format.elementProperties', 'Time Signature Properties'));
    case 'InstrumentName':
      return elementThen(target, item('instruments.staffProperties'));
    case 'Harmony':
      return harmonyItems(target);
    case 'FretDiagram':
      return fretDiagramItems(target);
    case 'InstrumentChange':
      return elementThen(target, item('instruments.changeAt'));
    case 'VBox':
      return frameItems(target, true);
    case 'HBox':
      return frameItems(target, false);
    case 'HairpinSegment':
      return snapItems(target, true);
    case 'GradualTempoChangeSegment':
      return snapItems(target, false);
    case 'Text':
      return textItems(target);
    default:
      return elementItems(target);
  }
}

/** The SVG element under a right-click, as the engine drew it. */
export interface SvgHit {
  /** Engine type name (the first class), or null for blank paper and staff lines. */
  readonly type: string | null;
  /** Drawn as part of the selection (`svgClass` adds "selected"). */
  readonly selected: boolean;
}

/**
 * Reads the engine's type name and selection mark off the SVG: each element is drawn under
 * `class="<typeName>[ selected]"` (engine/musescore/bridge/bridge.cpp, `svgClass`). Staff lines
 * count as blank space: MuseScore hits the bar there, which the engine decides.
 */
export function svgHitAt(target: Element | null): SvgHit {
  let element = target;
  while (element && element.tagName.toLowerCase() !== 'svg') {
    const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (classes.length > 0 && /^[A-Z]/.test(classes[0])) {
      if (classes[0] === 'StaffLines') return { type: null, selected: false };
      return { type: classes[0], selected: classes.includes('selected') };
    }
    element = element.parentElement;
  }
  return { type: null, selected: false };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const pointInBoxes = (point: { x: number; y: number } | null, boxes: readonly Box[]) =>
  Boolean(point) &&
  boxes.some(
    (box) =>
      point!.x >= box.x && point!.x <= box.x + box.w && point!.y >= box.y && point!.y <= box.y + box.h,
  );

/**
 * `mousePress_considerSelect` for the right button: a hit that is already selected, or a point
 * inside the selected range, keeps the selection; anything else is selected as a left click
 * would select it. A miss never deselects, which the caller's select path guarantees.
 */
export const keepsSelectionOnRightClick = (hit: SvgHit, insideRange: boolean): boolean =>
  hit.selected || insideRange;

/**
 * The hit's type once the right-click has selected: a bar when the engine selected a range on
 * blank staff space, the engine's own type for a single element, else what the SVG said.
 */
export function hitTypeAfterSelect(hit: SvgHit, selection: EngineSelection): string | null {
  if (selection.kind === 'range' && !hit.type) return MEASURE;
  if (selection.kind === 'single' && selection.type) return selection.type;
  return hit.type;
}

/** What a menu is about, however it was read: the hit's type, the selection, and whether the element edits. */
export interface ResolvedContext {
  readonly hitType: string | null;
  readonly selection: EngineSelection;
  readonly editable: boolean;
  readonly flags?: ContextFlags;
  readonly drumStaff?: boolean;
}

/** The engine's own answer (`contextHitAtPoint` / `contextSelectionInfo`). */
export const contextFromReport = (report: ContextHitReport): ResolvedContext => ({
  hitType: report.hit?.type ?? null,
  selection: report.selection,
  editable: report.hit?.editable ?? false,
  flags: report.hit?.flags,
  drumStaff: report.hit?.drumStaff,
});
