import { JSDOM } from 'jsdom';

// These counts deliberately describe a limited model, not engraving correctness.
export function musicXmlFacts(xml) {
  const doc = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  if (doc.documentElement.localName !== 'score-partwise') throw new Error('Only score-partwise MusicXML is supported');
  const parts = [...doc.querySelectorAll('score-partwise > part')];
  if (!parts.length) throw new Error('No MusicXML parts');
  const counts = parts.map(part => part.querySelectorAll(':scope > measure').length);
  const notes = [...doc.querySelectorAll('score-partwise > part > measure > note')];
  const pitched = notes.filter(note => note.querySelector(':scope > pitch'));
  // Unpitched and nonstandard notes need a different cross-engine mapping.
  const unsupportedNotes = notes.some(note => !note.querySelector(':scope > pitch, :scope > rest'));
  return {
    parts: parts.length,
    measures: counts.every(count => count === counts[0]) ? counts[0] : null,
    pitchedNotes: unsupportedNotes ? null : pitched.length,
    rests: notes.filter(note => note.querySelector(':scope > rest')).length,
    visiblePitchedNotes: unsupportedNotes ? null : pitched.filter(note => note.getAttribute('print-object') !== 'no' &&
      note.querySelector(':scope > notehead')?.textContent?.trim() !== 'none').length,
  };
}

export const factNames = ['parts', 'measures', 'pitchedNotes', 'rests', 'visiblePitchedNotes'];
export function compareFacts(input, osmd, musescore) {
  return factNames.map(metric => {
    const values = { input: input[metric], osmd: osmd[metric], musescore: musescore[metric] };
    const supported = Object.values(values).every(value => Number.isInteger(value) && value >= 0);
    return { metric, values, status: !supported ? 'unsupported' :
      values.input === values.osmd && values.input === values.musescore ? 'agree' : 'needs-review' };
  });
}
