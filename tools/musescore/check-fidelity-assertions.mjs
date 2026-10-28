// Mutation checks: each fixture's musical expectation must reject an intentionally damaged input.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFidelity, assertFidelityRendering, assertFidelityTiming } from './verify-fidelity.mjs';

const changes = {
  'nested-undotted': xml => xml.replace('<type>eighth</type>', '<type>eighth</type><dot/>'),
  'tie-system-break': xml => xml.replace('<tie type="start"/>', ''),
  'cross-staff': xml => xml.replace('<staff>2</staff>', '<staff>1</staff>'),
  'hidden-note': xml => xml.replace(' print-object="no"', ''),
  'pickup-lyrics': xml => xml.replace('<extend type="start"/>', ''),
  'slur-system-break': xml => xml.replace('<slur type="stop" number="1"/>', ''),
  'dynamics-articulations': xml => xml.replace('<accent/>', ''),
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
