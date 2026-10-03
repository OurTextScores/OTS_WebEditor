import type { EditorCore } from '../core';

export function addDynamic(core: EditorCore, dynamicType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add dynamic',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addDynamic');
      if (!fn) return;
      return fn(dynamicType);
    },
    { incrementalLayout: true },
  );
}

export function addHairpin(core: EditorCore, hairpinType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add hairpin',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addHairpin');
      if (!fn) return;
      return fn(hairpinType);
    },
    { incrementalLayout: true },
  );
}

export function addFermata(core: EditorCore, fermataVariant: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add fermata',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addFermata');
      if (!fn) return false;
      return fn(fermataVariant);
    },
    { incrementalLayout: true },
  );
}

export function addBreath(core: EditorCore, breathType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add breath or caesura',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addBreath');
      if (!fn) return false;
      return fn(breathType);
    },
    { incrementalLayout: true },
  );
}

export function addArpeggio(core: EditorCore, arpeggioType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add arpeggio',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addArpeggio');
      if (!fn) return false;
      return fn(arpeggioType);
    },
    { incrementalLayout: true },
  );
}

export function addTremolo(core: EditorCore, tremoloType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add tremolo',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTremolo');
      if (!fn) return false;
      return fn(tremoloType);
    },
    { incrementalLayout: true },
  );
}

export function addOttava(core: EditorCore, ottavaType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add ottava',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addOttava');
      if (!fn) return false;
      return fn(ottavaType);
    },
    { incrementalLayout: true },
  );
}

export function addTrill(core: EditorCore, trillType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add trill line',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addTrill');
      if (!fn) return false;
      return fn(trillType);
    },
    { incrementalLayout: true },
  );
}

export function addGlissando(core: EditorCore, glissandoType: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('add glissando', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addGlissando');
    if (!fn) return false;
    return fn(glissandoType);
  });
}

export function addPedal(core: EditorCore, pedalVariant: number) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add pedal',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addPedal');
      if (!fn) return;
      return fn(pedalVariant);
    },
    { incrementalLayout: true },
  );
}

export function addSostenutoPedal(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add sostenuto pedal',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addSostenutoPedal');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function addUnaCorda(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add una corda',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addUnaCorda');
      if (!fn) return;
      return fn();
    },
    { incrementalLayout: true },
  );
}

export function splitPedal(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('split pedal', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('splitPedal');
    if (!fn) return;
    return fn();
  });
}

export function addTempoText(core: EditorCore, bpm: number) {
  const { performMutation, requireMutation, selectedElement } = core;
  const hadSelection = Boolean(selectedElement);
  return performMutation(
    'add tempo text',
    async () => {
      const fn = requireMutation('addTempoText');
      if (!fn) return;
      return fn(bpm);
    },
    hadSelection ? { incrementalLayout: true } : { clearSelection: true, incrementalLayout: true },
  );
}

export function addArticulation(core: EditorCore, articulationSymbolName: string) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    `add articulation ${articulationSymbolName}`,
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addArticulation');
      if (!fn) return;
      return fn(articulationSymbolName);
    },
    { incrementalLayout: true },
  );
}

export function addAmbitus(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(
    'add ambitus',
    async () => {
      await ensureSelectionInWasm();
      const fn = requireMutation('addAmbitus');
      if (!fn) return false;
      return fn();
    },
    { skipWasmReselect: true, skipSelectionFallback: true, incrementalLayout: true },
  );
}

export function runRangeToolOnSelection(
  core: EditorCore,
  label: string,
  method: 'explodeSelection' | 'implodeSelection' | 'regroupSelection' | 'resequenceRehearsalMarks',
) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation(label, async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation(method);
    if (!fn) return false;
    return fn();
  });
}
