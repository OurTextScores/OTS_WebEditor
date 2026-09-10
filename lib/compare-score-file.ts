import { detectScoreInputFormat } from './public-score-url';
import {
  decodeScoreXml as decodeSavedXml,
  loadWebMscore,
  loadWebMscoreInProcess,
  type Score,
} from './webmscore-loader';

/** Load any editor-supported score file and return a MusicXML snapshot for comparison. */
export async function loadCompareScoreMusicXml(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const format = detectScoreInputFormat(file.name, data);

  if (format === 'musicxml' || format === 'xml') {
    const xml = new TextDecoder().decode(data);
    if (!xml.trim()) {
      throw new Error(`${file.name} is empty.`);
    }
    return xml;
  }

  let loadedScore: Score | null = null;
  try {
    try {
      const webMscore = await loadWebMscore();
      loadedScore = await webMscore.load(format, data.slice(), [], false);
    } catch (workerError) {
      console.warn('Worker score conversion failed, retrying in-process.', workerError);
      const webMscore = await loadWebMscoreInProcess();
      loadedScore = await webMscore.load(format, data.slice(), [], false);
    }

    if (!loadedScore.saveXml) {
      throw new Error('This score engine cannot convert the selected file to MusicXML.');
    }
    const xml = await decodeSavedXml(await loadedScore.saveXml());
    if (!xml.trim()) {
      throw new Error(`Could not read MusicXML from ${file.name}.`);
    }
    return xml;
  } finally {
    loadedScore?.destroy();
  }
}
