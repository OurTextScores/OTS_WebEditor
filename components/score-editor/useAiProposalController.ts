'use client';

import { useCallback, useRef, useState } from 'react';

import {
  computeClientProposalHashes,
  verifyAiProposalCurrentContent,
} from '../../lib/ai-edit-proposal-client';
import { type ClientProposalSession } from '../../lib/proposal-session-client';

export type AiProposalIdentity = {
  expectedCurrentContentHash?: string | null;
  expectedCurrentIdentityHash?: string | null;
};

export type AiProposalContinuitySnapshot = {
  expectedCurrentContentHash: string | null;
  expectedCurrentIdentityHash: string | null;
  baseXml: string;
};

export function useAiProposalController() {
  const expectedContentHashRef = useRef<string | null>(null);
  const expectedIdentityHashRef = useRef<string | null>(null);
  const baseXmlRef = useRef('');
  const applyErrorRef = useRef<string | null>(null);
  const sessionRef = useRef<ClientProposalSession | null>(null);
  const [applyError, setApplyErrorState] = useState<string | null>(null);
  const [audit, setAudit] = useState<Record<string, unknown> | null>(null);

  const setApplyError = useCallback((message: string | null) => {
    applyErrorRef.current = message;
    setApplyErrorState(message);
  }, []);

  const snapshot = useCallback(
    (): AiProposalContinuitySnapshot => ({
      expectedCurrentContentHash: expectedContentHashRef.current,
      expectedCurrentIdentityHash: expectedIdentityHashRef.current,
      baseXml: baseXmlRef.current,
    }),
    [],
  );

  const restore = useCallback(
    (value: AiProposalContinuitySnapshot) => {
      expectedContentHashRef.current = value.expectedCurrentContentHash;
      expectedIdentityHashRef.current = value.expectedCurrentIdentityHash;
      baseXmlRef.current = value.baseXml;
      setApplyError(null);
    },
    [setApplyError],
  );

  const capture = useCallback(
    (proposal: AiProposalIdentity | null | undefined, baseXml: string) => {
      expectedContentHashRef.current = proposal?.expectedCurrentContentHash || null;
      expectedIdentityHashRef.current = proposal?.expectedCurrentIdentityHash || null;
      baseXmlRef.current = baseXml;
      setApplyError(null);
    },
    [setApplyError],
  );

  const verifyCurrent = useCallback(
    async (liveXml: string, fallbackBaseXml: string) => {
      const result = await verifyAiProposalCurrentContent({
        currentXml: liveXml,
        expectedCurrentContentHash: expectedContentHashRef.current,
        expectedCurrentIdentityHash: expectedIdentityHashRef.current,
        baseXml: baseXmlRef.current || fallbackBaseXml,
      });
      expectedContentHashRef.current = result.expectedCurrentContentHash;
      expectedIdentityHashRef.current = result.expectedCurrentIdentityHash;
      if (!result.ok) {
        setApplyError('The current score no longer matches this proposal.');
      }
      return result;
    },
    [setApplyError],
  );

  const recordAppliedXml = useCallback(
    async (xml: string) => {
      const hashes = await computeClientProposalHashes(xml);
      expectedContentHashRef.current = hashes.contentHash;
      expectedIdentityHashRef.current = hashes.identityHash;
      setApplyError(null);
      return hashes;
    },
    [setApplyError],
  );

  const invalidateExpectedCurrent = useCallback(
    (message: string) => {
      expectedContentHashRef.current = null;
      expectedIdentityHashRef.current = null;
      setApplyError(message);
    },
    [setApplyError],
  );

  const getExpectedHashes = useCallback(
    () => ({
      contentHash: expectedContentHashRef.current,
      identityHash: expectedIdentityHashRef.current,
    }),
    [],
  );

  const getSession = useCallback(() => sessionRef.current, []);
  const setSession = useCallback((session: ClientProposalSession | null) => {
    sessionRef.current = session;
  }, []);

  const clear = useCallback(() => {
    expectedContentHashRef.current = null;
    expectedIdentityHashRef.current = null;
    baseXmlRef.current = '';
    sessionRef.current = null;
    setApplyError(null);
    setAudit(null);
  }, [setApplyError]);

  return {
    applyError,
    audit,
    setAudit,
    setApplyError,
    getApplyError: () => applyErrorRef.current,
    snapshot,
    restore,
    capture,
    verifyCurrent,
    recordAppliedXml,
    invalidateExpectedCurrent,
    getExpectedHashes,
    getSession,
    setSession,
    clear,
  };
}

export type AiProposalController = ReturnType<typeof useAiProposalController>;
