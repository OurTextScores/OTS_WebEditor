import { notifyError } from '../../shell/notices';
import { downloadBlob } from '../download-blob';
import type { EditorCore } from '../core';

export async function exportSvg(core: EditorCore) {
  const { runSerializedScoreOperation, score } = core;
  if (!score) return;
  try {
    const svg = await runSerializedScoreOperation(() => score.saveSvg(0, true), 'saveSvg(export)');
    downloadBlob(svg, 'score.svg', 'image/svg+xml');
  } catch (err) {
    console.error('Failed to export SVG', err);
    notifyError('Unable to export SVG. See console for details.');
  }
}

export async function exportPdf(core: EditorCore) {
  const { score } = core;
  if (!score) return;
  try {
    const pdf = await score.savePdf();
    downloadBlob(pdf, 'score.pdf', 'application/pdf');
  } catch (err) {
    console.error('Failed to export PDF', err);
    notifyError('Unable to export PDF. See console for details.');
  }
}

export async function exportMxl(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMxl) {
    notifyError('MXL export is not available in this build.');
    return;
  }
  try {
    const mxl = await score.saveMxl();
    downloadBlob(mxl, 'score.mxl', 'application/vnd.recordare.musicxml');
  } catch (err) {
    console.error('Failed to export MXL', err);
    notifyError('Unable to export MXL. See console for details.');
  }
}

/** MEI (MEI Basic) through MuseScore's MEI exporter (roadmap E25), with the layout's page and system breaks. */
export async function exportMei(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMei) {
    notifyError('MEI export is not available in this build.');
    return;
  }
  try {
    const mei = await score.saveMei();
    downloadBlob(mei, 'score.mei', 'application/mei+xml');
  } catch (err) {
    console.error('Failed to export MEI', err);
    notifyError('Unable to export MEI. See console for details.');
  }
}

/** MNX (JSON) through MuseScore's MNX exporter (roadmap E29), with its defaults: beams exported, rest positions not. */
export async function exportMnx(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMnx) {
    notifyError('MNX export is not available in this build.');
    return;
  }
  try {
    const mnx = await score.saveMnx();
    downloadBlob(mnx, 'score.mnx', 'application/vnd.mnx+json');
  } catch (err) {
    console.error('Failed to export MNX', err);
    notifyError(
      `Unable to export MNX: ${err instanceof Error ? err.message : 'see console for details'}.`,
    );
  }
}

export async function exportMscz(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMsc) {
    notifyError('MSCZ export is not available in this build.');
    return;
  }
  try {
    const mscz = await score.saveMsc('mscz');
    downloadBlob(mscz, 'score.mscz', 'application/vnd.musescore.mscz');
  } catch (err) {
    console.error('Failed to export MSCZ', err);
    notifyError('Unable to export MSCZ. See console for details.');
  }
}

export async function exportMscx(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMsc) {
    notifyError('MSCX export is not available in this build.');
    return;
  }
  try {
    const mscx = await score.saveMsc('mscx');
    downloadBlob(mscx, 'score.mscx', 'application/xml');
  } catch (err) {
    console.error('Failed to export MSCX', err);
    notifyError('Unable to export MSCX. See console for details.');
  }
}

export async function exportMusicXml(core: EditorCore) {
  const { runSerializedScoreOperation, score } = core;
  if (!score || !score.saveXml) {
    notifyError('MusicXML export is not available in this build.');
    return;
  }
  try {
    const xml = await runSerializedScoreOperation(() => score.saveXml!(), 'saveXml(export)');
    downloadBlob(xml, 'score.musicxml', 'application/vnd.recordare.musicxml+xml');
  } catch (err) {
    console.error('Failed to export MusicXML', err);
    notifyError('Unable to export MusicXML. See console for details.');
  }
}

export async function exportMidi(core: EditorCore) {
  const { score } = core;
  if (!score || !score.saveMidi) {
    notifyError('MIDI export is not available in this build.');
    return;
  }
  try {
    const midi = await score.saveMidi(true, true);
    downloadBlob(midi, 'score.mid', 'audio/midi');
  } catch (err) {
    console.error('Failed to export MIDI', err);
    notifyError('Unable to export MIDI. See console for details.');
  }
}
