/**
 * The score's right-click menu (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md):
 * MuseScore 4.7's menus as command trees, the hook that selects and opens one, and the menu.
 */
export {
  contextFromReport,
  contextMenuFor,
  hitTypeAfterSelect,
  isEditableType,
  keepsSelectionOnRightClick,
  menuTypeFor,
  pointInBoxes,
  svgHitAt,
  type ContextMenuTarget,
  type EngineSelection,
  type ResolvedContext,
  type ScoreContextMenuState,
  type SvgHit,
} from './contextMenus';
export { ScoreContextMenu } from './ScoreContextMenu';
export { useScoreContextMenu, type ScoreContextMenuInputs } from './useScoreContextMenu';
