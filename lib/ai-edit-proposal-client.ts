import { computeMusicXmlIdentityHash } from './musicxml-identity';

export type AiProposalHashCheck = {
  ok: boolean;
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

export async function verifyAiProposalCurrentContent(input: {
  expectedCurrentContentHash: string | null;
  expectedCurrentIdentityHash?: string | null;
  baseXml: string;
  currentXml: string;
}): Promise<AiProposalHashCheck> {
  const expectedCurrentContentHash =
    input.expectedCurrentContentHash || (await computeClientScoreHash(input.baseXml));
  const actualCurrentContentHash = await computeClientScoreHash(input.currentXml);
  const expectedCurrentIdentityHash = input.expectedCurrentIdentityHash || null;
  const actualCurrentIdentityHash = expectedCurrentIdentityHash
    ? await computeMusicXmlIdentityHash(input.currentXml)
    : null;
  return {
    ok:
      actualCurrentContentHash === expectedCurrentContentHash ||
      (expectedCurrentIdentityHash !== null &&
        actualCurrentIdentityHash === expectedCurrentIdentityHash),
    expectedCurrentContentHash,
    actualCurrentContentHash,
    expectedCurrentIdentityHash,
    actualCurrentIdentityHash,
  };
}
