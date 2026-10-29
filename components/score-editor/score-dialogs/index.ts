/**
 * The score's settings dialogs (Page Settings, Style, Measure Properties, Select ▸ More…, Realize Chord Symbols):
 * data-driven specs over the engine, one dialog component, and the store that says which is open.
 */
export {
  DIALOG_SPECS,
  MUSIC_FONTS,
  changeInstrumentDialog,
  staffPropertiesDialog,
  measurePropertiesDialog,
  pageSettingsDialog,
  realizeHarmonyDialog,
  selectMoreDialog,
  styleDialog,
  textFontFor,
  type DialogContext,
  type DialogEngine,
  type DialogField,
  type DialogSpec,
  type FieldValue,
  type ScoreDialogKind,
} from './dialogSpecs';
export { ScoreDialog } from './ScoreDialog';
export { closeScoreDialog, getOpenScoreDialog, openScoreDialog, type OpenScoreDialog } from './scoreDialogStore';
export { dialogEngineFor } from './dialogEngine';
