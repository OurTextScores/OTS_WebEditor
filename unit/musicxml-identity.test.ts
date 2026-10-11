import { describe, expect, it } from 'vitest';

import {
  canonicalizeMusicXmlIdentity,
  computeMusicXmlContentIdentityHash,
  computeMusicXmlIdentityHash,
} from '../lib/musicxml-identity';
import { computeMusicXmlIdentityHashServer } from '../lib/musicxml-identity-server';

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<!-- source comment -->
<score-partwise version="4.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <identification>
    <encoding>
      <encoding-date>2026-07-17</encoding-date>
      <software>OTS</software>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>A &amp; B</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1" width="100">
      <note default-x="10" xlink:href="urn:note:1">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><stem>up</stem>
      </note>
    </measure>
  </part>
</score-partwise>`;

const REPRESENTATION_VARIANT = `<?xml version="1.1"?>
<score-partwise xmlns:link="http://www.w3.org/1999/xlink" version="4.0"><identification><encoding>
<encoding-date>2040-01-01</encoding-date><software>OTS</software></encoding></identification><part-list><score-part id="P1"><part-name>A &#38; B</part-name></score-part></part-list><part id="P1"><measure width="100" number="1"><note link:href="urn:note:1" default-x="10"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><stem>up</stem></note></measure></part></score-partwise>`;

describe('MusicXML identity canonicalization', () => {
  it('normalizes representation-only and volatile provenance differences', async () => {
    expect(canonicalizeMusicXmlIdentity(REPRESENTATION_VARIANT)).toBe(
      canonicalizeMusicXmlIdentity(BASE_XML),
    );

    const serverHash = computeMusicXmlIdentityHashServer(BASE_XML);
    expect(serverHash).toMatch(/^xmlid-v1:[a-f0-9]{64}$/);
    await expect(computeMusicXmlIdentityHash(REPRESENTATION_VARIANT)).resolves.toBe(serverHash);
  });

  it.each([
    ['layout', BASE_XML.replace('width="100"', 'width="101"')],
    ['id', BASE_XML.replace('id="P1"', 'id="P2"')],
    ['voice', BASE_XML.replace('<voice>1</voice>', '<voice>2</voice>')],
    ['stem', BASE_XML.replace('<stem>up</stem>', '<stem>down</stem>')],
    ['attribute value', BASE_XML.replace('default-x="10"', 'default-x="11"')],
    ['meaningful text', BASE_XML.replace('<step>C</step>', '<step>D</step>')],
    [
      'child order',
      BASE_XML.replace(
        '<duration>1</duration><voice>1</voice>',
        '<voice>1</voice><duration>1</duration>',
      ),
    ],
  ])('preserves identity-significant %s changes', (_label, changedXml) => {
    expect(canonicalizeMusicXmlIdentity(changedXml)).not.toBe(
      canonicalizeMusicXmlIdentity(BASE_XML),
    );
  });

  it('preserves whitespace-only leaf text and xml:space content', () => {
    const oneSpace =
      '<score-partwise><credit><credit-words> </credit-words></credit></score-partwise>';
    const twoSpaces =
      '<score-partwise><credit><credit-words>  </credit-words></credit></score-partwise>';
    const preserved = '<score-partwise xml:space="preserve"> <part-list/> </score-partwise>';
    const compact = '<score-partwise xml:space="preserve"><part-list/></score-partwise>';

    expect(canonicalizeMusicXmlIdentity(oneSpace)).not.toBe(
      canonicalizeMusicXmlIdentity(twoSpaces),
    );
    expect(canonicalizeMusicXmlIdentity(preserved)).not.toBe(canonicalizeMusicXmlIdentity(compact));
  });

  it('does not ignore encoding-date lookalikes from another namespace', () => {
    const first =
      '<score-partwise xmlns:f="urn:foreign"><f:identification><f:encoding><f:encoding-date>one</f:encoding-date></f:encoding></f:identification></score-partwise>';
    const second = first.replace('>one<', '>two<');

    expect(canonicalizeMusicXmlIdentity(first)).not.toBe(canonicalizeMusicXmlIdentity(second));
  });

  it('rejects malformed XML instead of producing an identity', () => {
    expect(() => canonicalizeMusicXmlIdentity('<score-partwise><part></score-partwise>')).toThrow();
  });
});

/**
 * One score as the engine writes it on a page that holds both bars on one system, and again
 * after the page has been laid out narrower: a system break before bar 2, other widths and
 * positions, and a second page with its own copy of the footer.
 */
const laidOut = ({
  wide,
  secondNote = 'D',
  title = 'Two bars',
  lyric = 'la',
}: {
  wide: boolean;
  secondNote?: string;
  title?: string;
  lyric?: string;
}) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <credit page="1"><credit-type>title</credit-type><credit-words default-x="${wide ? 600 : 300}" default-y="1500" justify="center">${title}</credit-words></credit>
  <credit page="1"><credit-type>rights</credit-type><credit-words default-x="600" default-y="80">CC0</credit-words></credit>
  ${wide ? '' : '<credit page="2"><credit-type>rights</credit-type><credit-words default-x="600" default-y="80">CC0</credit-words></credit>'}
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1" width="${wide ? '241.56' : '535.23'}">
      <print><system-layout><system-margins><left-margin>${wide ? '0.00' : '-0.00'}</left-margin><right-margin>0.00</right-margin></system-margins><top-system-distance>170.00</top-system-distance></system-layout></print>
      <note default-x="${wide ? '138.26' : '211.68'}" default-y="-35.00">
        <pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type>
        <lyric number="1" default-x="6.5" default-y="-45" relative-y="${wide ? '-30' : '-32'}"><syllabic>single</syllabic><text>${lyric}</text></lyric>
      </note>
    </measure>
    <measure number="2" width="${wide ? '150.12' : '443.80'}">
      ${wide ? '' : '<print new-system="yes"><system-layout><system-distance>85.00</system-distance></system-layout></print>'}
      <note default-x="${wide ? '46.83' : '120.25'}" default-y="-30.00">
        <pitch><step>${secondNote}</step><octave>4</octave></pitch><duration>4</duration><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe('MusicXML content identity', () => {
  it('is the same for one score laid out two ways', async () => {
    const wide = laidOut({ wide: true });
    const narrow = laidOut({ wide: false });

    expect(await computeMusicXmlContentIdentityHash(narrow)).toBe(
      await computeMusicXmlContentIdentityHash(wide),
    );
    expect(await computeMusicXmlContentIdentityHash(wide)).toMatch(/^xmlcontent-v1:[0-9a-f]{64}$/);
    // The strict identity is for exactly what this one sets aside, and still tells them apart.
    expect(await computeMusicXmlIdentityHash(narrow)).not.toBe(
      await computeMusicXmlIdentityHash(wide),
    );
  });

  it('changes with the music and its text, in either layout', async () => {
    const original = await computeMusicXmlContentIdentityHash(laidOut({ wide: true }));

    for (const edit of [{ secondNote: 'E' }, { title: 'Three bars' }, { lyric: 'lu' }]) {
      expect(await computeMusicXmlContentIdentityHash(laidOut({ wide: true, ...edit }))).not.toBe(
        original,
      );
      expect(await computeMusicXmlContentIdentityHash(laidOut({ wide: false, ...edit }))).not.toBe(
        original,
      );
    }
  });

  it('keeps everything that is not layout', () => {
    const canonical = canonicalizeMusicXmlIdentity(laidOut({ wide: false }), {
      ignoreLayout: true,
    });

    expect(canonical).not.toMatch(/default-x|default-y|relative-y|system-distance|535\.23/);
    expect(canonical).not.toContain('new-system');
    // One footer, not one per page; the title and the bar numbers stay.
    expect(canonical.match(/CC0/g)).toHaveLength(1);
    expect(canonical).toContain('Two bars');
    expect(canonical).toMatch(/"0:6:number","1"/);
    expect(canonical).toMatch(/"0:6:number","2"/);
    expect(canonical).toContain('justify');
  });

  it('sets aside only MusicXML layout, not lookalikes', () => {
    const withForeign = (width: string) =>
      canonicalizeMusicXmlIdentity(
        `<score-partwise xmlns:x="urn:x"><part id="P1"><measure number="1" x:width="${width}">` +
          `<x:print>${width}</x:print><barline width="${width}"/></measure></part></score-partwise>`,
        { ignoreLayout: true },
      );

    // A namespaced width or print, and a width that is not a measure's, are content.
    expect(withForeign('1')).not.toBe(withForeign('2'));
    expect(withForeign('1')).toContain('urn:x');
  });

  it('does not let a removed print leave its white space behind as text', async () => {
    const withPrint =
      '<score-partwise><part id="P1"><measure number="1">\n  <print new-system="yes"/>\n</measure></part></score-partwise>';
    const without = '<score-partwise><part id="P1"><measure number="1"/></part></score-partwise>';

    expect(await computeMusicXmlContentIdentityHash(withPrint)).toBe(
      await computeMusicXmlContentIdentityHash(without),
    );
  });
});
