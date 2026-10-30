// Mutation checks: each fixture's musical expectation must reject an intentionally damaged input.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFidelity, assertFidelityRendering, assertFidelityTiming, assertRepeatTraversal } from './verify-fidelity.mjs';

const changes = {
  'nested-undotted': xml => xml.replace('<type>eighth</type>', '<type>eighth</type><dot/>'),
  'tie-system-break': xml => xml.replace('<tie type="start"/>', ''),
  'cross-staff': xml => xml.replace('<staff>2</staff>', '<staff>1</staff>'),
  'hidden-note': xml => xml.replace(' print-object="no"', ''),
  'pickup-lyrics': xml => xml.replace('<extend type="start"/>', ''),
  'slur-system-break': xml => xml.replace('<slur type="stop" number="1"/>', ''),
  'dynamics-articulations': xml => xml.replace('<accent/>', ''),
  'octave-system-break': xml => xml.replace('type="down" size="8"', 'type="up" size="8"'),
  'polyphony-accidentals': xml => xml.replace('<accidental>sharp</accidental>', ''),
  'multipage-layout': xml => xml.replace('new-page="yes"', 'new-page="no"'),
  'crowded-markings': xml => xml.replace('<dynamics><sfz/></dynamics>', ''),
  'transposing-enharmonic': xml => xml.replace('<alter>1</alter>', '<alter>-1</alter>'),
  'grace-ornament-clef': xml => xml.replace('<trill-mark/>', ''),
  'multimeasure-rest': xml => xml.replace('<multiple-rest>2</multiple-rest>', '<multiple-rest>3</multiple-rest>'),
  'meter-key-change': xml => xml.replace('<fifths>2</fifths>', '<fifths>1</fifths>'),
  'repeat-endings': xml => xml.replace('direction="backward"', 'direction="forward"'),
  'hairpin-system-break': xml => xml.replace('type="crescendo"', 'type="diminuendo"'),
  'pedal-system-break': xml => xml.replace('type="stop" line="yes"', 'type="change" line="yes"'),
  'chord-ties-system-break': xml => xml.replace('<tie type="start"/>', ''),
  'two-part-independence': xml => xml.replace('<sign>F</sign>', '<sign>G</sign>'),
};
for (const [id, mutate] of Object.entries(changes)) {
  const xml = await readFile(new URL(`./fixtures/osmd-fidelity/${id}.musicxml`, import.meta.url), 'utf8');
  assertFidelity(id, xml);
  const modified = mutate(xml);
  assert.notEqual(modified, xml, `${id}: mutation applied`);
  assert.throws(() => assertFidelity(id, modified), undefined, `${id}: assertion must detect mutation`);
  console.log(`${id}: mutation detected`);
}

// A controlled nested-score SVG catches an added dot independently of XML semantics.
const cleanSvg = '<svg>' + '<path class="Note"/>'.repeat(10) + '</svg>';
assertFidelityRendering('nested-undotted', cleanSvg);
assert.throws(() => assertFidelityRendering('nested-undotted', cleanSvg.replace('</svg>', '<path class="NoteDot"/></svg>')));
console.log('nested-undotted: rendered dot mutation detected');

const lyricSvg = '<svg><g transform="matrix(1 0 0 1 10 0)"><path class="Note"/></g><g transform="matrix(1 0 0 1 20 0)"><path class="Note"/></g><g transform="matrix(1 0 0 1 30 0)"><path class="Note"/></g><path class="Lyrics"/><g transform="matrix(1 0 0 1 12 0)"><polyline class="LyricsLineSegment" points="0,0 15,0"/></g></svg>';
assertFidelityRendering('pickup-lyrics', lyricSvg);
assert.throws(() => assertFidelityRendering('pickup-lyrics', lyricSvg.replace('15,0', '25,0')));
console.log('pickup-lyrics: overlong extension mutation detected');

const nested = await readFile(new URL('./fixtures/osmd-fidelity/nested-undotted.musicxml', import.meta.url), 'utf8');
assertFidelityTiming('nested-undotted', nested);
assert.throws(() => assertFidelityTiming('nested-undotted', nested.replace('<duration>4</duration>', '<duration>5</duration>')));
console.log('nested-undotted: changed elapsed duration detected');

for (const [id, search] of [
  ['slur-system-break', '<slur type="start" number="1"/>'],
  ['dynamics-articulations', '<staccato/>'],
  ['dynamics-articulations', '<dynamics><f/></dynamics>'],
  ['dynamics-articulations', '<dynamics><p/></dynamics>'],
  ['meter-key-change', '<time><beats>3</beats><beat-type>4</beat-type></time>'],
  ['repeat-endings', '<repeat direction="forward"/>'],
  ['repeat-endings', '<ending number="1" type="start"/>'],
  ['repeat-endings', '<ending number="2" type="stop"/>'],
]) {
  const xml = await readFile(new URL(`./fixtures/osmd-fidelity/${id}.musicxml`, import.meta.url), 'utf8');
  const modified = xml.replace(search, '');
  assert.notEqual(modified, xml, `${id}: mutation applied`);
  assert.throws(() => assertFidelity(id, modified), undefined, `${id}: assertion must detect ${search}`);
}
console.log('slur endpoints, dynamics and articulations: additional mutations detected');

const staffLines = '<path class="StaffLines"/>'.repeat(10);
const slurSvg = `<svg>${staffLines}<path class="SlurSegment"/><path class="SlurSegment"/></svg>`;
assertFidelityRendering('slur-system-break', slurSvg);
assert.throws(() => assertFidelityRendering('slur-system-break', slurSvg.replace('<path class="SlurSegment"/>', '')));
const dynamicsSvg = '<svg><path class="Dynamic"/><path class="Dynamic"/><path class="Articulation"/><path class="Articulation"/></svg>';
assertFidelityRendering('dynamics-articulations', dynamicsSvg);
assert.throws(() => assertFidelityRendering('dynamics-articulations', dynamicsSvg.replace('<path class="Dynamic"/>', '')));
assert.throws(() => assertFidelityRendering('dynamics-articulations', dynamicsSvg.replace('<path class="Articulation"/>', '')));
console.log('slur segments, dynamics and articulations: rendering mutations detected');

const renderedCases = [
  ['octave-system-break', '<path class="StaffLines"/>'.repeat(10) + '<path class="OttavaSegment"/>'.repeat(2), '<path class="OttavaSegment"/>'],
  ['polyphony-accidentals', '<path class="StaffLines"/>'.repeat(10) + '<path class="Note"/>'.repeat(8) + '<path class="Accidental"/>'.repeat(2), '<path class="Accidental"/>'],
  ['multipage-layout', '<path class="Note"/>'.repeat(4), '<path class="Note"/>'],
  ['crowded-markings', '<path class="Dynamic"/>'.repeat(4) + '<path class="Articulation"/>'.repeat(4), '<path class="Dynamic"/>'],
  ['transposing-enharmonic', '<path class="Note"/>'.repeat(4) + '<path class="Accidental"/>', '<path class="Accidental"/>'],
  ['grace-ornament-clef', '<path class="Note"/>'.repeat(5) + '<path class="Clef"/>'.repeat(2) + '<path class="Ornament"/>', '<path class="Ornament"/>'],
  ['multimeasure-rest', '<path class="MMRest"/>', '<path class="MMRest"/>'],
  ['meter-key-change', '<path class="TimeSig"/>'.repeat(2) + '<path class="KeySig"/>', '<path class="TimeSig"/>'],
  ['meter-key-change', '<path class="TimeSig"/>'.repeat(2) + '<path class="KeySig"/>', '<path class="KeySig"/>'],
  ['repeat-endings', '<path class="VoltaSegment"/>'.repeat(2), '<path class="VoltaSegment"/>'],
  ['hairpin-system-break', '<path class="StaffLines"/>'.repeat(10) + '<path class="HairpinSegment"/>'.repeat(2), '<path class="HairpinSegment"/>'],
  ['pedal-system-break', '<path class="StaffLines"/>'.repeat(10) + '<path class="PedalSegment"/>'.repeat(2), '<path class="PedalSegment"/>'],
  ['chord-ties-system-break', '<path class="StaffLines"/>'.repeat(10) + '<path class="TieSegment"/>'.repeat(4) + '<path class="Note"/>'.repeat(8), '<path class="TieSegment"/>'],
  ['two-part-independence', '<path class="StaffLines"/>'.repeat(10) + '<path class="Note"/>'.repeat(12), '<path class="Note"/>'],
];
for (const [id, body, remove] of renderedCases) {
  const svg = `<svg>${body}</svg>`;
  assertFidelityRendering(id, svg);
  assert.throws(() => assertFidelityRendering(id, svg.replace(remove, '')), undefined, `${id}: rendered feature mutation detected`);
}
console.log('new fixture rendering mutations detected');
const octaveInput = await readFile(new URL('./fixtures/osmd-fidelity/octave-system-break.musicxml', import.meta.url), 'utf8');
const octaveStop = '<direction placement="below"><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>';
const movedStop = octaveInput.replace(octaveStop, '').replace('<measure number="3">', `<measure number="3">${octaveStop}`);
assert.notEqual(movedStop, octaveInput);
assert.throws(() => assertFidelity('octave-system-break', movedStop), undefined, 'octave stop must stay in its original measure');
console.log('octave endpoint moved to another measure detected');

const meterInput = await readFile(new URL('./fixtures/osmd-fidelity/meter-key-change.musicxml', import.meta.url), 'utf8');
assert.throws(() => assertFidelity('meter-key-change', meterInput.replace('<duration>4</duration>', '<duration>5</duration>')));
console.log('meter change: incorrect measure duration detected');
assertRepeatTraversal('repeat-endings', { repeated: [0, 1, 0, 2, 3], linear: [0, 1, 2, 3] });
assert.throws(() => assertRepeatTraversal('repeat-endings', { repeated: [0, 1, 2, 3], linear: [0, 1, 2, 3] }));
assert.throws(() => assertRepeatTraversal('repeat-endings', { repeated: [0, 1, 0, 2, 3], linear: [0, 1, 0, 2, 3] }));
console.log('repeat playback: incorrect enabled and disabled traversal detected');

for (const [id, endpoint] of [
  ['hairpin-system-break', '<direction placement="below"><direction-type><wedge type="stop" number="1"/></direction-type></direction>'],
  ['pedal-system-break', '<direction placement="below"><direction-type><pedal type="stop" line="yes" number="1"/></direction-type></direction>'],
]) {
  const xml = await readFile(new URL(`./fixtures/osmd-fidelity/${id}.musicxml`, import.meta.url), 'utf8');
  const moved = xml.replace(endpoint, '').replace('<measure number="3">', `<measure number="3">${endpoint}`);
  assert.notEqual(moved, xml);
  assert.throws(() => assertFidelity(id, moved), undefined, `${id}: endpoint stays in measure 2`);
}
const pedalInput = await readFile(new URL('./fixtures/osmd-fidelity/pedal-system-break.musicxml', import.meta.url), 'utf8');
assert.throws(() => assertFidelity('pedal-system-break', pedalInput.replace('line="yes"', 'line="no"')));
console.log('hairpin and pedal: endpoint and pedal style mutations detected');

const chordTies = await readFile(new URL('./fixtures/osmd-fidelity/chord-ties-system-break.musicxml', import.meta.url), 'utf8');
for (const [before, after] of [
  ['<step>E</step><octave>4</octave></pitch><duration>16</duration><tie type="start"/>', '<step>E</step><octave>4</octave></pitch><duration>16</duration>'],
  ['<step>E</step><octave>4</octave></pitch><duration>16</duration><tie type="stop"/>', '<step>E</step><octave>4</octave></pitch><duration>16</duration>'],
  ['<note><chord/><pitch><step>E</step>', '<note><pitch><step>E</step>'],
  ['<tied type="stop"/>', ''],
  ['<step>E</step><octave>4</octave>', '<step>E</step><octave>5</octave>'],
]) {
  const changed = chordTies.replace(before, after);
  assert.notEqual(changed, chordTies);
  assert.throws(() => assertFidelity('chord-ties-system-break', changed));
}
const twoParts = await readFile(new URL('./fixtures/osmd-fidelity/two-part-independence.musicxml', import.meta.url), 'utf8');
const changedLowerPart = twoParts.replace('<step>D</step><octave>3</octave>', '<step>E</step><octave>3</octave>');
assert.notEqual(changedLowerPart, twoParts);
assert.throws(() => assertFidelity('two-part-independence', changedLowerPart));
console.log('chord ties and independent part mutations detected');
