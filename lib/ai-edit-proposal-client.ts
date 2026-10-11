import {
  computeMusicXmlContentIdentityHash,
  computeMusicXmlIdentityHash,
} from './musicxml-identity';

export type AiProposalHashCheck = {
  ok: boolean;
  /**
   * What made the live score count as the one the proposal was written for: the same bytes,
   * the same XML, or the same content laid out differently. Null when it is none of these.
   */
  matchedBy: 'raw' | 'identity' | 'content' | null;
  expectedCurrentContentHash: string;
  actualCurrentContentHash: string;
  expectedCurrentIdentityHash: string | null;
  actualCurrentIdentityHash: string | null;
};

export async function computeClientScoreHash(content: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot verify the proposal against the current score.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `sha256:${hex}`;
}

export async function computeClientProposalHashes(content: string): Promise<{
  contentHash: string;
  identityHash: string;
}> {
  const [contentHash, identityHash] = await Promise.all([
    computeClientScoreHash(content),
    computeMusicXmlIdentityHash(content),
  ]);
  return { contentHash, identityHash };
}

async function computeIdentityHashOrNull(xml: string): Promise<string | null> {
  try {
    return await computeMusicXmlIdentityHash(xml);
  } catch {
    return null;
  }
}

/**
 * Whether two serializations are one score laid out differently. False when either cannot be
 * read: an unreadable score is not evidence that nothing changed.
 */
async function sameContentWhateverTheLayout(expectedXml: string, currentXml: string) {
  try {
    const [expected, current] = await Promise.all([
      computeMusicXmlContentIdentityHash(expectedXml),
      computeMusicXmlContentIdentityHash(currentXml),
    ]);
    return expected === current;
  } catch {
    return false;
  }
}

/**
 * The gate in front of Apply: is the live score still the one this proposal was written for?
 *
 * The same bytes or the same XML say yes. So does the same content in another layout: while a
 * proposal is being compared, the comparison lays the live score out again so that its
 * systems line up with the proposal's, and takes that back on closing. Read strictly, that is
 * a changed score, and every Apply was refused although nothing had been edited. A change of
 * layout alone made by hand in that time is therefore not a reason to refuse either; a change
 * to the music or its text still is.
 *
 * Comparing content needs the text the proposal expects (`expectedCurrentXml`), and that text
 * counts only if it is the one the expected hashes describe. The hashes come from whoever
 * wrote the proposal and remain the authority: a proposal written against some other score
 * is refused however well the live score matches what this editor happened to keep.
 */
export async function verifyAiProposalCurrentContent(input: {
  expectedCurrentContentHash: string | null;
  expectedCurrentIdentityHash?: string | null;
  baseXml: string;
  expectedCurrentXml?: string | null;
  currentXml: string;
}): Promise<AiProposalHashCheck> {
  const expectedCurrentContentHash =
    input.expectedCurrentContentHash || (await computeClientScoreHash(input.baseXml));
  const actualCurrentContentHash = await computeClientScoreHash(input.currentXml);
  const expectedCurrentIdentityHash = input.expectedCurrentIdentityHash || null;
  const actualCurrentIdentityHash = expectedCurrentIdentityHash
    ? await computeMusicXmlIdentityHash(input.currentXml)
    : null;
  let matchedBy: AiProposalHashCheck['matchedBy'] = null;
  if (actualCurrentContentHash === expectedCurrentContentHash) {
    matchedBy = 'raw';
  } else if (
    expectedCurrentIdentityHash !== null &&
    actualCurrentIdentityHash === expectedCurrentIdentityHash
  ) {
    matchedBy = 'identity';
  } else if (input.expectedCurrentXml) {
    const describesExpectation =
      (await computeClientScoreHash(input.expectedCurrentXml)) === expectedCurrentContentHash ||
      (expectedCurrentIdentityHash !== null &&
        (await computeIdentityHashOrNull(input.expectedCurrentXml)) ===
          expectedCurrentIdentityHash);
    if (
      describesExpectation &&
      (await sameContentWhateverTheLayout(input.expectedCurrentXml, input.currentXml))
    ) {
      matchedBy = 'content';
    }
  }
  return {
    ok: matchedBy !== null,
    matchedBy,
    expectedCurrentContentHash,
    actualCurrentContentHash,
    expectedCurrentIdentityHash,
    actualCurrentIdentityHash,
  };
}
