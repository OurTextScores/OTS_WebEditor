import { promptForText } from '../prompt-for-text';
import type { EditorCore } from '../core';

export async function addStaffText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Staff text:');
  if (text === null) {
    return;
  }
  return performMutation('add staff text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addStaffText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addSystemText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('System text:');
  if (text === null) {
    return;
  }
  return performMutation('add system text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addSystemText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addExpressionText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Expression text:');
  if (text === null) {
    return;
  }
  return performMutation('add expression text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addExpressionText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addLyricText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Lyrics text:');
  if (text === null) {
    return;
  }
  return performMutation('add lyric text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addLyricText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addFingeringText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Fingering text:');
  if (text === null) {
    return;
  }
  return performMutation('add fingering text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addFingeringText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addLeftHandGuitarFingeringText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Left-hand guitar fingering text:');
  if (text === null) {
    return;
  }
  return performMutation('add left-hand guitar fingering text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addLeftHandGuitarFingeringText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addRightHandGuitarFingeringText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Right-hand guitar fingering text:');
  if (text === null) {
    return;
  }
  return performMutation('add right-hand guitar fingering text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addRightHandGuitarFingeringText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addStringNumberText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('String number text:');
  if (text === null) {
    return;
  }
  return performMutation('add string number text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addStringNumberText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addInstrumentChangeText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Instrument change text:');
  if (text === null) {
    return;
  }
  return performMutation('add instrument change text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addInstrumentChangeText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addStickingText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Sticking text:');
  if (text === null) {
    return;
  }
  return performMutation('add sticking text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addStickingText');
    if (!fn) return;
    return fn(text);
  });
}

export async function addFiguredBassText(core: EditorCore) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  const text = await promptForText('Figured bass text:');
  if (text === null) {
    return;
  }
  return performMutation('add figured bass text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('addFiguredBassText');
    if (!fn) return;
    return fn(text);
  });
}

export function applySelectedText(core: EditorCore, value: string) {
  const { ensureSelectionInWasm, performMutation, requireMutation } = core;
  return performMutation('set selected text', async () => {
    await ensureSelectionInWasm();
    const fn = requireMutation('setSelectedText');
    if (!fn) {
      return false;
    }
    return fn(value);
  });
}
