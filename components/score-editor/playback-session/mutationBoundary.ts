import type { Score } from '../../../lib/webmscore-loader';

/** Explicit notation/lifecycle boundary; selection, layout-only rendering and CSS zoom keep playing. */
export const PLAYBACK_MUTATION_METHODS = [
  'undoRedoTo',
  'beginElementDrag',
  'updateElementDrag',
  'endElementDrag',
  'applyDropAtPoint',
  'beginGripEdit',
  'dragGrip',
  'endGripEdit',
  'pasteSelection',
  'deleteSelection',
  'pitchUp',
  'pitchDown',
  'transpose',
  'setAccidental',
  'doubleDuration',
  'halfDuration',
  'toggleDot',
  'toggleDoubleDot',
  'putNote',
  'addPitchByStep',
  'enterRest',
  'setDurationType',
  'toggleLineBreak',
  'togglePageBreak',
  'changeSelectedElementsVoice',
  'addDynamic',
  'addHairpin',
  'addFermata',
  'addBreath',
  'addArpeggio',
  'addTremolo',
  'addOttava',
  'addTrill',
  'addGlissando',
  'addPedal',
  'addSostenutoPedal',
  'addUnaCorda',
  'splitPedal',
  'addTempoText',
  'addArticulation',
  'addSlur',
  'flipStem',
  'addTie',
  'addGraceNote',
  'addTuplet',
  'addStaffText',
  'addSystemText',
  'addExpressionText',
  'addLyricText',
  'addHarmonyText',
  'addFingeringText',
  'addLeftHandGuitarFingeringText',
  'addRightHandGuitarFingeringText',
  'addStringNumberText',
  'addInstrumentChangeText',
  'addStickingText',
  'addFiguredBassText',
  'setTitleText',
  'setSubtitleText',
  'setComposerText',
  'setLyricistText',
  'setSelectedText',
  'setSelectedElementProperty',
  'addFretDiagram',
  'setSelectedFretDiagram',
  'addAmbitus',
  'explodeSelection',
  'implodeSelection',
  'regroupSelection',
  'resequenceRehearsalMarks',
  'appendPart',
  'appendPartByMusicXmlId',
  'removePart',
  'setPartVisible',
  'addNoteFromRest',
  'undo',
  'redo',
  'setTimeSignature',
  'setTimeSignatureWithType',
  'setKeySignature',
  'setHarmonyVoiceLiteral',
  'setChordSymbolStylePreset',
  'setClef',
  'toggleRepeatStart',
  'toggleRepeatEnd',
  'setRepeatCount',
  'setBarLineType',
  'addVolta',
  'addMarker',
  'addJump',
  'setNoteheadGroup',
  'setBeamMode',
  'addMeasureRepeat',
  'setMultiMeasureRests',
  'insertMeasures',
  'addPickupMeasure',
  'removeSelectedMeasures',
  'removeTrailingEmptyMeasures',
  'setSystemLock',
  'moveSelectedMeasureToSystem',
  'setMeasureLengthToTimeSignature',
  'setMeasureLineBreaks',
  'setMeasureSpacer',
  'addRehearsalMark',
  'setLayoutMode',
  'destroy',
] as const satisfies readonly (keyof Score)[];

export function guardPlaybackMutations(score: Score, beforeMutation: () => Promise<void>): Score {
  const guarded = new Set<string>(PLAYBACK_MUTATION_METHODS);
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(score, {
    set(target, key, value) {
      methods.delete(key);
      return Reflect.set(target, key, value, target);
    },
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(key)) {
        methods.set(
          key,
          guarded.has(String(key))
            ? async (...args: unknown[]) => {
                await beforeMutation();
                return Reflect.apply(value, target, args);
              }
            : value.bind(target),
        );
      }
      return methods.get(key);
    },
  });
}
