import { describe, expect, it } from 'vitest';

import {
  computeClientScoreHash,
  verifyAiProposalCurrentContent,
} from '../lib/ai-edit-proposal-client';
import { computeMusicXmlIdentityHash } from '../lib/musicxml-identity';

describe('AI edit proposal content guard', () => {
  it('rejects apply when the live score changed after proposal generation', async () => {
    const baseXml = '<score-partwise><measure number="1"/></score-partwise>';
    const expectedCurrentContentHash = await computeClientScoreHash(baseXml);

    const check = await verifyAiProposalCurrentContent({
      expectedCurrentContentHash,
      baseXml,
      currentXml: '<score-partwise><measure number="1"><note/></measure></score-partwise>',
    });

    expect(check).toMatchObject({
      ok: false,
      expectedCurrentContentHash,
    });
    expect(check.actualCurrentContentHash).not.toBe(expectedCurrentContentHash);
  });

  it('advances the expected hash after a partial apply', async () => {
    const baseXml = '<score-partwise><measure number="1"/><measure number="2"/></score-partwise>';
    const afterFirstApply =
      '<score-partwise><measure number="1"><note/></measure><measure number="2"/></score-partwise>';
    const initialHash = await computeClientScoreHash(baseXml);

    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: initialHash,
        baseXml,
        currentXml: baseXml,
      }),
    ).toMatchObject({ ok: true });

    const advancedHash = await computeClientScoreHash(afterFirstApply);
    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: advancedHash,
        baseXml,
        currentXml: afterFirstApply,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: initialHash,
        baseXml,
        currentXml: afterFirstApply,
      }),
    ).toMatchObject({ ok: false });
  });

  it('accepts strict identity-equivalent serialization drift while retaining raw hashes', async () => {
    const baseXml = `<?xml version="1.0"?>
<score-partwise version="4.0"><identification><encoding><encoding-date>2026-07-17</encoding-date></encoding></identification><part id="P1"><measure number="1" width="100"><note><voice>1</voice><stem>up</stem></note></measure></part></score-partwise>`;
    const roundTrippedXml =
      '<score-partwise version="4.0"><identification><encoding><encoding-date>2026-07-18</encoding-date></encoding></identification><part id="P1">\n  <measure width="100" number="1"><note><voice>1</voice><stem>up</stem></note></measure>\n</part></score-partwise>';
    const expectedCurrentContentHash = await computeClientScoreHash(baseXml);
    const expectedCurrentIdentityHash = await computeMusicXmlIdentityHash(baseXml);

    const check = await verifyAiProposalCurrentContent({
      expectedCurrentContentHash,
      expectedCurrentIdentityHash,
      baseXml,
      currentXml: roundTrippedXml,
    });

    expect(check.ok).toBe(true);
    expect(check.actualCurrentContentHash).not.toBe(expectedCurrentContentHash);
    expect(check.actualCurrentIdentityHash).toBe(expectedCurrentIdentityHash);
  });

  it('rejects identity-significant drift and does not bypass stale legacy raw hashes', async () => {
    const baseXml =
      '<score-partwise><part id="P1"><measure number="1" width="100"><note><voice>1</voice><stem>up</stem></note></measure></part></score-partwise>';
    const changedXml = baseXml.replace('width="100"', 'width="101"');
    const expectedCurrentContentHash = await computeClientScoreHash(baseXml);
    const expectedCurrentIdentityHash = await computeMusicXmlIdentityHash(baseXml);

    await expect(
      verifyAiProposalCurrentContent({
        expectedCurrentContentHash,
        expectedCurrentIdentityHash,
        baseXml,
        currentXml: changedXml,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      verifyAiProposalCurrentContent({
        expectedCurrentContentHash: `sha256:${'0'.repeat(64)}`,
        baseXml,
        currentXml: baseXml,
      }),
    ).resolves.toMatchObject({ ok: false, actualCurrentIdentityHash: null });
  });

  // While a proposal is compared, the comparison lays the live score out again so that its
  // systems line up with the proposal's. Nothing has been edited, but the score no longer
  // serializes to the bytes, or the XML, that the proposal was written for.
  const base = (step: string, relaidOut: boolean) =>
    `<score-partwise version="4.0"><part id="P1"><measure number="1" width="${relaidOut ? '535.23' : '241.56'}">` +
    `<note default-x="${relaidOut ? '211.68' : '138.26'}"><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration></note></measure>` +
    `<measure number="2">${relaidOut ? '<print new-system="yes"/>' : ''}<note><rest/><duration>4</duration></note></measure></part></score-partwise>`;

  it('allows Apply when the comparison has only laid the live score out again', async () => {
    const expectedXml = base('C', false);
    const check = await verifyAiProposalCurrentContent({
      expectedCurrentContentHash: await computeClientScoreHash(expectedXml),
      expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(expectedXml),
      baseXml: expectedXml,
      expectedCurrentXml: expectedXml,
      currentXml: base('C', true),
    });

    expect(check).toMatchObject({ ok: true, matchedBy: 'content' });
    // The strict hashes are reported as they are: they did not match.
    expect(check.actualCurrentContentHash).not.toBe(check.expectedCurrentContentHash);
    expect(check.actualCurrentIdentityHash).not.toBe(check.expectedCurrentIdentityHash);
  });

  it('still refuses when the music changed, laid out again or not', async () => {
    const expectedXml = base('C', false);
    for (const relaidOut of [false, true]) {
      expect(
        await verifyAiProposalCurrentContent({
          expectedCurrentContentHash: await computeClientScoreHash(expectedXml),
          expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(expectedXml),
          baseXml: expectedXml,
          expectedCurrentXml: expectedXml,
          currentXml: base('D', relaidOut),
        }),
      ).toMatchObject({ ok: false, matchedBy: null });
    }
  });

  it('does not guess when it has no text to compare the live score with', async () => {
    const expectedXml = base('C', false);

    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: await computeClientScoreHash(expectedXml),
        expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(expectedXml),
        baseXml: expectedXml,
        currentXml: base('C', true),
      }),
    ).toMatchObject({ ok: false, matchedBy: null });
  });

  it('does not let a kept text stand in for hashes it does not match', async () => {
    // The proposal was written against some other score: its hashes are not those of the
    // text this editor captured. That the live score matches the captured text proves nothing.
    const captured = base('C', false);
    const elsewhere = base('D', false);

    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: await computeClientScoreHash(elsewhere),
        expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(elsewhere),
        baseXml: captured,
        expectedCurrentXml: captured,
        currentXml: base('C', true),
      }),
    ).toMatchObject({ ok: false, matchedBy: null });
  });

  it('refuses a live score it cannot read rather than waving it through', async () => {
    const expectedXml = base('C', false);

    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: await computeClientScoreHash(expectedXml),
        baseXml: expectedXml,
        expectedCurrentXml: expectedXml,
        currentXml: '<score-partwise><part>',
      }),
    ).toMatchObject({ ok: false, matchedBy: null });
  });

  it('says which check matched', async () => {
    const expectedXml = base('C', false);
    const hash = await computeClientScoreHash(expectedXml);

    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: hash,
        baseXml: expectedXml,
        currentXml: expectedXml,
      }),
    ).toMatchObject({ ok: true, matchedBy: 'raw' });
    expect(
      await verifyAiProposalCurrentContent({
        expectedCurrentContentHash: hash,
        expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(expectedXml),
        baseXml: expectedXml,
        currentXml: expectedXml.replace('<part id="P1">', '<part  id="P1" >'),
      }),
    ).toMatchObject({ ok: true, matchedBy: 'identity' });
  });
});
