import { decodeScoreXml, loadWebMscore } from '../../../lib/webmscore-loader';

/**
 * MusicXML for a MIDI file, through the engine's own MIDI import. The server converts with
 * the MuseScore CLI when it has one; this covers the builds and machines that do not.
 */
export async function midiToMusicXml(midiBytes: Uint8Array): Promise<string> {
  const WebMscore = await loadWebMscore();
  const score = await WebMscore.load('midi', midiBytes, [], false);
  try {
    if (!score.saveXml) throw new Error('This engine build cannot export MusicXML.');
    const xml = await decodeScoreXml(await score.saveXml());
    if (!xml.includes('<score-partwise')) throw new Error('The engine did not return MusicXML.');
    return xml;
  } finally {
    score.destroy();
  }
}
