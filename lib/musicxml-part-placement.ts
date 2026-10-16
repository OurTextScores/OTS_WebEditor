/**
 * Place parts generated for a measure range at that range in the full score: rest bars
 * before and after, so the parts can be added to the score with `appendMusicXmlParts`
 * and line up with the bars they were written for.
 */

import type { MeasureFraction } from './midi-range-slice';

export type ScoreMeasure = {
  /** The length the measure actually holds (a pickup is shorter than its time signature). */
  actual: MeasureFraction;
  /** The time signature in force. */
  nominal: MeasureFraction;
};

export type PlacedPartsResult = {
  xml: string;
  /** Generated measures used, after any past the end of the score were dropped. */
  placedMeasureCount: number;
  warnings: string[];
};

const childrenNamed = (parent: Element, name: string) =>
  Array.from(parent.children).filter((child) => child.localName === name);
const firstChildNamed = (parent: Element, name: string) =>
  Array.from(parent.children).find((child) => child.localName === name) ?? null;

const sameFraction = (a: MeasureFraction, b: MeasureFraction) =>
  a.numerator === b.numerator && a.denominator === b.denominator;

function timeElement(doc: Document, sig: MeasureFraction): Element {
  const time = doc.createElement('time');
  const beats = doc.createElement('beats');
  beats.textContent = String(sig.numerator);
  const beatType = doc.createElement('beat-type');
  beatType.textContent = String(sig.denominator);
  time.append(beats, beatType);
  return time;
}

/** One measure of whole-bar rests, one per staff. */
function restMeasure(
  doc: Document,
  measure: ScoreMeasure,
  divisions: number,
  staves: number,
  attributes: Element | null,
): { element: Element; exact: boolean } {
  const element = doc.createElement('measure');
  if (attributes) element.appendChild(attributes);
  const raw = (measure.actual.numerator / measure.actual.denominator) * 4 * divisions;
  const duration = Math.max(1, Math.round(raw));
  for (let staff = 1; staff <= staves; staff += 1) {
    if (staff > 1) {
      const backup = doc.createElement('backup');
      const backupDuration = doc.createElement('duration');
      backupDuration.textContent = String(duration);
      backup.appendChild(backupDuration);
      element.appendChild(backup);
    }
    const note = doc.createElement('note');
    const rest = doc.createElement('rest');
    rest.setAttribute('measure', 'yes');
    const noteDuration = doc.createElement('duration');
    noteDuration.textContent = String(duration);
    const voice = doc.createElement('voice');
    voice.textContent = String((staff - 1) * 4 + 1);
    note.append(rest, noteDuration, voice);
    if (staves > 1) {
      const staffElement = doc.createElement('staff');
      staffElement.textContent = String(staff);
      note.appendChild(staffElement);
    }
    element.appendChild(note);
  }
  return { element, exact: Math.abs(raw - duration) < 1e-6 };
}

/**
 * Pads every part of `sourceXml` (measures for `measures[startIndex]` onward) with rest
 * bars so it spans the whole score. The first bar carries the part's attributes with the
 * score's opening time signature; later rest bars restate a time signature where it changes.
 */
export function placeMusicXmlPartsAtMeasure(
  sourceXml: string,
  measures: ScoreMeasure[],
  startIndex: number,
): PlacedPartsResult {
  if (startIndex < 0 || startIndex >= measures.length) {
    throw new Error(
      `Start measure ${startIndex + 1} is outside the score (${measures.length} bars).`,
    );
  }
  const doc = new DOMParser().parseFromString(sourceXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Generated MusicXML is not well-formed.');
  }
  const root = doc.documentElement;
  if (root?.localName !== 'score-partwise') {
    throw new Error('Generated MusicXML must have a <score-partwise> root.');
  }

  const warnings: string[] = [];
  let placedMeasureCount = 0;
  let inexact = false;

  for (const part of childrenNamed(root, 'part')) {
    const generated = childrenNamed(part, 'measure');
    const firstAttributes = generated[0] ? firstChildNamed(generated[0], 'attributes') : null;
    const divisions = Number(
      firstAttributes && firstChildNamed(firstAttributes, 'divisions')?.textContent,
    );
    const safeDivisions = Number.isFinite(divisions) && divisions > 0 ? divisions : 1;
    const staves = Number(
      firstAttributes && firstChildNamed(firstAttributes, 'staves')?.textContent,
    );
    const staffCount = Number.isFinite(staves) && staves > 1 ? staves : 1;

    const room = measures.length - startIndex;
    if (generated.length > room) {
      warnings.push(
        `Dropped ${generated.length - room} generated bar(s) past the end of the score.`,
      );
    }
    const used = generated.slice(0, room);
    placedMeasureCount = Math.max(placedMeasureCount, used.length);
    for (const measure of generated) part.removeChild(measure);

    const openingAttributes = (): Element => {
      const attributes = firstAttributes
        ? (firstAttributes.cloneNode(true) as Element)
        : doc.createElement('attributes');
      for (const time of childrenNamed(attributes, 'time')) attributes.removeChild(time);
      const time = timeElement(doc, measures[0].nominal);
      // MusicXML orders attributes: divisions, key, time, staves, ... clef.
      const after = ['staves', 'part-symbol', 'instruments', 'clef']
        .map((name) => firstChildNamed(attributes, name))
        .find(Boolean);
      attributes.insertBefore(time, after ?? null);
      if (!firstChildNamed(attributes, 'divisions')) {
        const div = doc.createElement('divisions');
        div.textContent = String(safeDivisions);
        attributes.insertBefore(div, attributes.firstChild);
      }
      return attributes;
    };
    const restAt = (index: number) => {
      let attributes: Element | null = null;
      if (index === 0) attributes = openingAttributes();
      else if (!sameFraction(measures[index].nominal, measures[index - 1].nominal)) {
        attributes = doc.createElement('attributes');
        attributes.appendChild(timeElement(doc, measures[index].nominal));
      }
      const { element, exact } = restMeasure(
        doc,
        measures[index],
        safeDivisions,
        staffCount,
        attributes,
      );
      inexact ||= !exact;
      return element;
    };

    const placed: Element[] = [];
    for (let index = 0; index < startIndex; index += 1) placed.push(restAt(index));
    placed.push(...used);
    if (startIndex > 0 && used[0] && firstAttributes) {
      // The part's clef/key/divisions were restated on bar 1; the generated bar keeps
      // only a time signature if it differs from the bar before.
      const attributes = firstChildNamed(used[0], 'attributes');
      if (attributes) {
        for (const child of Array.from(attributes.children)) {
          if (child.localName !== 'time') attributes.removeChild(child);
        }
        if (sameFraction(measures[startIndex].nominal, measures[startIndex - 1].nominal)) {
          for (const time of childrenNamed(attributes, 'time')) attributes.removeChild(time);
        }
        if (attributes.children.length === 0) used[0].removeChild(attributes);
      }
    }
    for (let index = startIndex + used.length; index < measures.length; index += 1) {
      placed.push(restAt(index));
    }

    const pickup =
      measures.length > 1 &&
      measures[0].actual.numerator / measures[0].actual.denominator <
        measures[0].nominal.numerator / measures[0].nominal.denominator;
    placed.forEach((measure, index) => {
      measure.setAttribute('number', String(pickup ? index : index + 1));
      if (pickup && index === 0) measure.setAttribute('implicit', 'yes');
      else measure.removeAttribute('implicit');
      part.appendChild(measure);
    });
  }

  if (inexact) {
    warnings.push(
      'Some rest bars could not be expressed exactly at the generated part’s divisions.',
    );
  }
  return { xml: new XMLSerializer().serializeToString(doc), placedMeasureCount, warnings };
}
