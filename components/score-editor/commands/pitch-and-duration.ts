import { notifyWarning } from '../../shell/notices';
import type { EditorCore } from '../core';

export function transpose(core: EditorCore, semitones: number) {
  const { performMutation, requireMutation } = core;
  return performMutation(
    `transpose ${semitones} semitones`,
    async () => {
      const fn = requireMutation('transpose');
      if (!fn) return;
      // Use BY_INTERVAL mode with the closest standard interval for octave shortcuts
      // For octave up/down (±12), use Perfect Octave (index 25)
      const absSemitones = Math.abs(semitones);
      if (absSemitones === 12) {
        const direction = semitones > 0 ? 0 : 1; // UP=0, DOWN=1
        return fn(1, direction, 0, 25, true, true, true); // BY_INTERVAL, Perfect Octave
      }
      // For other semitone values, use BY_INTERVAL with lookup
      // Simple mapping: semitones to interval index (common ones)
      const semitonesToInterval: Record<number, number> = {
        1: 3,
        2: 4,
        3: 7,
        4: 8,
        5: 11,
        6: 12,
        7: 14,
        8: 17,
        9: 18,
        10: 21,
        11: 22,
        12: 25,
      };
      const idx = semitonesToInterval[absSemitones] ?? 0;
      const direction = semitones > 0 ? 0 : 1;
      return fn(1, direction, 0, idx, true, true, true);
    },
    { skipWasmReselect: true, playSelectionPreview: true, incrementalLayout: true },
  );
}

export function transposeEx(
  core: EditorCore,
  mode: number,
  direction: number,
  key: number,
  interval: number,
  trKeys: boolean,
  trChordNames: boolean,
  useDoubleSharpsFlats: boolean,
) {
  const { performMutation, requireMutation } = core;
  return performMutation(
    'transpose',
    async () => {
      const fn = requireMutation('transpose');
      if (!fn) return;
      return fn(mode, direction, key, interval, trKeys, trChordNames, useDoubleSharpsFlats);
    },
    { skipWasmReselect: true, playSelectionPreview: true },
  );
}

export function setAccidental(core: EditorCore, accidentalType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    `set accidental ${accidentalType}`,
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setAccidental');
      if (!fn) return;
      return fn(accidentalType);
    },
    { playSelectionPreview: true, incrementalLayout: true },
  );
}

export function durationLonger(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'lengthen duration',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('doubleDuration');
      if (!fn) return;
      return fn();
    },
    { playSelectionPreview: true },
  );
}

export function durationShorter(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'shorten duration',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('halfDuration');
      if (!fn) return;
      return fn();
    },
    { playSelectionPreview: true },
  );
}

export function toggleDot(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle dot',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleDot');
      if (!fn) return;
      return fn();
    },
    { playSelectionPreview: true },
  );
}

export function toggleDoubleDot(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'toggle double dot',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('toggleDoubleDot');
      if (!fn) return;
      return fn();
    },
    { playSelectionPreview: true },
  );
}

export function setDurationType(core: EditorCore, durationType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'set duration',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('setDurationType');
      if (!fn) return;
      return fn(durationType);
    },
    { playSelectionPreview: true },
  );
}

export function addPitchByStep(core: EditorCore, noteIndex: number, addToChord: boolean) {
  const { ensureSelectionInWasm, noteInputActiveRef, performMutation, requireMutation } = core;
  const enteringNotes = noteInputActiveRef.current;
  const shouldAdvanceSelection = !enteringNotes && !addToChord;
  return performMutation(
    'add pitch',
    async () => {
      if (!enteringNotes) {
        await ensureSelectionInWasm();
      }
      const fn = requireMutation('addPitchByStep');
      if (!fn) return;
      return fn(noteIndex, addToChord, false);
    },
    {
      skipWasmReselect: true,
      skipSelectionFallback: enteringNotes || shouldAdvanceSelection,
      advanceSelection: shouldAdvanceSelection,
      playSelectionPreview: true,
    },
  );
}

export function enterRest(core: EditorCore) {
  const { ensureSelectionInWasm, noteInputActiveRef, performMutation, requireMutation } = core;
  const enteringNotes = noteInputActiveRef.current;
  return performMutation(
    'enter rest',
    async () => {
      if (!enteringNotes) {
        await ensureSelectionInWasm();
      }
      const fn = requireMutation('enterRest');
      if (!fn) return;
      return fn();
    },
    {
      skipWasmReselect: true,
      skipSelectionFallback: true,
      advanceSelection: !enteringNotes,
    },
  );
}

// Input-state setters only touch the engine InputState — no relayout needed.
export async function setInputDuration(core: EditorCore, durationType: number) {
  const { score } = core;
  const fn = score?.setInputDurationType;
  if (!fn) {
    return;
  }
  try {
    await Promise.resolve(fn.call(score, durationType));
  } catch (err) {
    console.warn('setInputDurationType failed:', err);
  }
}

export async function toggleInputDotState(core: EditorCore) {
  const { score } = core;
  const fn = score?.toggleInputDot;
  if (!fn) {
    return;
  }
  try {
    await Promise.resolve(fn.call(score));
  } catch (err) {
    console.warn('toggleInputDot failed:', err);
  }
}

export async function setInputAccidental(core: EditorCore, accidentalType: number) {
  const { score } = core;
  const fn = score?.setInputAccidentalType;
  if (!fn) {
    return;
  }
  try {
    await Promise.resolve(fn.call(score, accidentalType));
  } catch (err) {
    console.warn('setInputAccidentalType failed:', err);
  }
}

export function addNoteFromRest(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add note',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addNoteFromRest');
      if (!fn) return;
      return fn();
    },
    { playSelectionPreview: true },
  );
}

export function addTuplet(core: EditorCore, tupletCount: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(`add tuplet ${tupletCount}`, async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addTuplet');
    if (!fn) return;
    return fn(tupletCount);
  });
}

export function addGraceNote(core: EditorCore, graceType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    `add grace note ${graceType}`,
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addGraceNote');
      if (!fn) return;
      return fn(graceType);
    },
    { incrementalLayout: true },
  );
}

export function setVoice(core: EditorCore, voiceIndex: number) {
  const {
    ensureSelectionInWasm,
    performMutation,
    requireMutation,
    selectedElement,
    selectionBoxes,
  } = core;
  const hasSelection = Boolean(selectedElement) || selectionBoxes.length > 0;
  if (!hasSelection) {
    notifyWarning('Select notes or rests to move them to another voice.');
    return;
  }
  return performMutation(`change voice ${voiceIndex + 1}`, async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('changeSelectedElementsVoice');
    if (!fn) return;
    return fn(voiceIndex);
  });
}

export function setNoteheadGroup(core: EditorCore, noteheadGroup: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('set notehead group', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('setNoteheadGroup');
    if (!fn) return false;
    return fn(noteheadGroup);
  });
}

export function setBeamMode(core: EditorCore, beamMode: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('set beam mode', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('setBeamMode');
    if (!fn) return false;
    return fn(beamMode);
  });
}

export function flipStem(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'flip stem',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('flipStem');
      if (!fn) return false;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function addTie(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add tie',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTie');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function addSlur(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add slur',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addSlur');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}
