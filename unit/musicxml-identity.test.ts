import { describe, expect, it } from 'vitest';

import {
  canonicalizeMusicXmlIdentity,
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
