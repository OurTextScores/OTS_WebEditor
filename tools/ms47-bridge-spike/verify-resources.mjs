import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// On-demand resources (DECISIONS.md items 3 and 8), under MS47_LAZY_RESOURCES: the engine boots from a resource root
// without the lazy files (lazy-resources.json) and WebMscore.fetchResource serves them, as the CDN would in a browser.

const fixture = new URL('../../public/test_scores/four_measures.musicxml', import.meta.url);

// The fixture as MSCX with a different music font
async function withMusicFont(WebMscore, font) {
  const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(fixture)));
  try {
    const mscx = Buffer.from(await score.saveMsc('mscx')).toString();
    const out = mscx.replace(/<musicalSymbolFont>[^<]*</g, `<musicalSymbolFont>${font}<`).replace(/<musicalTextFont>[^<]*</g, `<musicalTextFont>${font} Text<`);
    assert.ok(out.includes(`<musicalSymbolFont>${font}<`), 'music font set');
    return new Uint8Array(Buffer.from(out));
  } finally { score.destroy(); }
}

const svgOf = async (WebMscore, format, data) => {
  const score = await WebMscore.load(format, data);
  try { return await score.saveSvg(0); } finally { score.destroy(); }
};

export async function verifyResources(WebMscore, lazy, { partsRan }) {
  assert.ok(lazy, 'run with MS47_LAZY_RESOURCES=1');
  const report = {};

  // A score in Petaluma fetches the font while loading and lays out with it; a second load (font now present) is
  // identical, so fetch-then-relayout gives the same result as having the font from the start
  {
    const data = await withMusicFont(WebMscore, 'Petaluma');
    lazy.fetched.length = 0;
    const first = await svgOf(WebMscore, 'mscx', data);
    assert.ok(lazy.fetched.includes('fonts/petaluma/Petaluma.otf'), `Petaluma fetched on load (${lazy.fetched})`);
    assert.match(first, /font-family="Petaluma"/, 'drawn in Petaluma');
    const fetches = lazy.fetched.length;
    const second = await svgOf(WebMscore, 'mscx', data);
    assert.equal(lazy.fetched.length, fetches, 'nothing fetched twice');
    assert.equal(second, first, 'fetched-then-relaid-out equals laid out with the font present');
    report.petaluma = [...lazy.fetched];
    console.log(`verified on-demand music font: Petaluma fetched (${lazy.fetched.join(', ')}), relayout equals a warm load`);
  }

  // An unavailable font: the score lays out with the fallback music font (Bravura) and the fetch is not retried
  {
    lazy.block = /musejazz/i;
    lazy.fetched.length = 0;
    const data = await withMusicFont(WebMscore, 'MuseJazz');
    const svg = await svgOf(WebMscore, 'mscx', data);
    assert.ok(lazy.fetched.some(p => p.includes('musejazz')), 'MuseJazz requested');
    assert.doesNotMatch(svg, /font-family="MuseJazz"/, 'not drawn in the missing font');
    assert.match(svg, /font-family="Bravura"/, 'drawn in the fallback music font');
    const attempts = lazy.fetched.length;
    await svgOf(WebMscore, 'mscx', data);
    assert.equal(lazy.fetched.length, attempts, 'an unavailable resource is not requested again');
    lazy.block = null;
    console.log('verified unavailable music font: Bravura fallback, no retry');
  }

  // CJK text asks for a fallback font by script; the loader fetches and registers it. Only meaningful when the parts
  // test (which registers a CJK font itself) has not run in this process.
  {
    lazy.serveFallbacks = true;
    lazy.fetched.length = 0;
    const xml = (await readFile(fixture, 'utf8')).replace(/(<score-partwise[^>]*>)/, '$1\n<work><work-title>おんがく</work-title></work>');
    const svg = await svgOf(WebMscore, 'musicxml', new Uint8Array(Buffer.from(xml)));
    assert.ok(lazy.fetched.includes('fonts/fallback/NotoSansJP-Regular.otf'), `Japanese fallback fetched (${lazy.fetched})`);
    if (!partsRan) assert.match(svg, />おんがく</, 'a kana-only title is drawn with the fetched fallback');
    report.cjk = { fetched: [...lazy.fetched], drawnChecked: !partsRan };
    console.log(`verified on-demand CJK fallback: ${lazy.fetched.join(', ')}${partsRan ? ' (drawing checked by the parts test)' : ', CJK-only title drawn'}`);
  }
  return report;
}
