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
});
