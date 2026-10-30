/**
 * The score's settings dialogs (Page Settings, Style, Measure Properties, Select ▸ More…, Realize Chord Symbols):
 * data-driven specs over the engine, one dialog component, and the store that says which is open.
 */
export {
  DIALOG_SPECS,
  changeInstrumentDialog,
  harpPedalsDialog,
  staffPropertiesDialog,
  measurePropertiesDialog,
  pageSettingsDialog,
  realizeHarmonyDialog,
  selectMoreDialog,
  type DialogContext,
  type DialogEngine,
  type DialogField,
  type DialogSpec,
  type FieldValue,
  type LoadedDialog,
  type ScoreDialogKind,
} from './dialogSpecs';
export { ScoreDialog } from './ScoreDialog';
export { MUSIC_FONTS, STYLE_PAGES, styleDialog, textFontFor } from './styleDialog';
export { staffTextPropertiesDialog, systemTextPropertiesDialog } from './staffTextDialog';
export { timeSigPropertiesDialog, type TimeSigUpdate } from './timeSigDialog';
export { closeScoreDialog, getOpenScoreDialog, openScoreDialog, type OpenScoreDialog } from './scoreDialogStore';
export { dialogEngineFor } from './dialogEngine';
