import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const fixture = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><text>one</text><extend type="start"/></lyric><lyric number="2"><text>two</text><extend type="start"/></lyric></note>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><extend type="stop"/></lyric></note>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="2"><extend type="stop"/></lyric></note>
<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><text>end</text></lyric></note>
</measure></part></score-partwise>`;

function check(xml) {
  const doc = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
  const note = step => [...doc.querySelectorAll('note')].find(n => n.querySelector('pitch > step')?.textContent === step);
  assert.ok(note('C').querySelector('lyric[number="1"] extend[type="start"]'));
  assert.ok(note('C').querySelector('lyric[number="2"] extend[type="start"]'));
  assert.ok(note('D').querySelector('lyric[number="1"] extend[type="stop"]'));
  assert.ok(!note('D').querySelector('lyric[number="2"] extend[type="stop"]'));
  assert.ok(note('E').querySelector('lyric[number="2"] extend[type="stop"]'));
  assert.equal(note('F').querySelector('lyric[number="1"] text')?.textContent, 'end');
}

export async function verifyLyricExtensions(WebMscore) {
  const score = await WebMscore.load('musicxml', new TextEncoder().encode(fixture));
  try {
    const xml = await score.saveXml();
    check(xml);
    const reloaded = await WebMscore.load('musicxml', new TextEncoder().encode(xml));
    try { check(await reloaded.saveXml()); } finally { await reloaded.destroy(); }
    return { separateVerses: true, roundTrip: true };
  } finally { await score.destroy(); }
}
