import type { Score } from '../../../lib/webmscore-loader';
import type { DialogEngine } from './dialogSpecs';

/** The dialogs' engine, when the loaded engine has every method they use (an older one has none of them). */
export function dialogEngineFor(score: Score | null): DialogEngine | null {
  if (!score) return null;
  const {
    getStyleValues,
    setStyleValues,
    getMeasureProperties,
    setMeasureProperties,
    selectWithOptions,
    realizeChordSymbols,
    getStaffProperties,
    setStaffProperties,
    changeInstrumentAt,
    contextSelectionInfo,
  } = score;
  if (
    !getStyleValues ||
    !setStyleValues ||
    !getMeasureProperties ||
    !setMeasureProperties ||
    !selectWithOptions ||
    !realizeChordSymbols ||
    !getStaffProperties ||
    !setStaffProperties ||
    !changeInstrumentAt ||
    !contextSelectionInfo
  ) {
    return null;
  }
  return {
    getStyleValues: (keys) => getStyleValues.call(score, keys),
    setStyleValues: (values) => setStyleValues.call(score, values),
    getMeasureProperties: () => getMeasureProperties.call(score),
    setMeasureProperties: (values) => setMeasureProperties.call(score, values),
    selectWithOptions: (page, x, y, options) => selectWithOptions.call(score, page, x, y, options),
    realizeChordSymbols: (literal, voicing, duration) => realizeChordSymbols.call(score, literal, voicing, duration),
    getStaffProperties: (staffIdx) => getStaffProperties.call(score, staffIdx),
    setStaffProperties: (staffIdx, values) => setStaffProperties.call(score, staffIdx, values),
    changeInstrumentAt: (instrumentId) => changeInstrumentAt.call(score, instrumentId),
    selectedStaffIdx: async () => (await contextSelectionInfo.call(score)).hit?.staffIdx ?? null,
  };
}
