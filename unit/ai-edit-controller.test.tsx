import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAiEditController } from '../components/score-editor/useAiEditController';
import { useAiProposalController } from '../components/score-editor/useAiProposalController';
import { computeClientScoreHash } from '../lib/ai-edit-proposal-client';
import { computeMusicXmlIdentityHash } from '../lib/musicxml-identity';
import { createClientProposalSession } from '../lib/proposal-session-client';

describe('AI edit controller', () => {
  it('owns request phases, progress, and cancellation', () => {
    const { result } = renderHook(() => useAiEditController('balanced'));

    let request!: ReturnType<typeof result.current.begin>;
    act(() => {
      request = result.current.begin('patch', 'Preparing patch request');
    });
    expect(result.current.state).toMatchObject({ phase: 'preparing', kind: 'patch' });
    expect(result.current.active).toBe(true);

    act(() => {
      result.current.updateProgress(request, {
        phase: 'provider.attempt_started',
        message: 'Generating patch',
      });
    });
    expect(result.current.state).toMatchObject({
      phase: 'requesting',
      message: 'Generating patch',
    });

    act(() => result.current.cancel());
    expect(request.controller.signal.aborted).toBe(true);
    act(() => result.current.finish(request, 'cancelled'));
    expect(result.current.state.phase).toBe('cancelled');
    expect(result.current.active).toBe(false);
  });

  it('keeps feedback requests in the feedback phase', () => {
    const { result } = renderHook(() => useAiEditController('thorough'));
    let request!: ReturnType<typeof result.current.begin>;
    act(() => {
      request = result.current.begin('feedback', 'Preparing feedback context');
      result.current.updateProgress(request, {
        phase: 'provider.attempt_started',
        message: 'Revising proposal',
      });
    });
    expect(result.current.state).toMatchObject({ phase: 'feedback', message: 'Revising proposal' });
  });
});

describe('AI proposal controller', () => {
  it('binds verification and advances expected hashes after Apply', async () => {
    const baseXml = '<score-partwise><part id="P1"><measure number="1"/></part></score-partwise>';
    const appliedXml =
      '<score-partwise><part id="P1"><measure number="1"><note/></measure></part></score-partwise>';
    const baseHash = await computeClientScoreHash(baseXml);
    const { result } = renderHook(() => useAiProposalController());

    act(() => result.current.capture({ expectedCurrentContentHash: baseHash }, baseXml));
    await expect(result.current.verifyCurrent(baseXml, baseXml)).resolves.toMatchObject({
      ok: true,
    });

    await act(async () => {
      await result.current.recordAppliedXml(appliedXml);
    });
    await expect(result.current.verifyCurrent(appliedXml, baseXml)).resolves.toMatchObject({
      ok: true,
    });
    await act(async () => {
      await expect(result.current.verifyCurrent(baseXml, baseXml)).resolves.toMatchObject({
        ok: false,
      });
    });
    expect(result.current.applyError).toBeTruthy();
  });

  // The comparison a proposal is shown in lays the live score out again to line its systems
  // up with the proposal's. That is not an edit, and must not close the gate.
  const laidOut = (notes: string, narrow: boolean) =>
    `<score-partwise><part id="P1"><measure number="1" width="${narrow ? 535 : 241}">${notes}</measure>` +
    `<measure number="2">${narrow ? '<print new-system="yes"/>' : ''}<note default-x="${narrow ? 120 : 46}"><rest/></note></measure></part></score-partwise>`;

  it('lets Apply through when the comparison has only laid the score out again', async () => {
    const baseXml = laidOut('<note><rest/></note>', false);
    // As the service sends them: the hashes of the score the request carried.
    const proposal = {
      expectedCurrentContentHash: await computeClientScoreHash(baseXml),
      expectedCurrentIdentityHash: await computeMusicXmlIdentityHash(baseXml),
    };
    const { result } = renderHook(() => useAiProposalController());

    act(() => result.current.capture(proposal, baseXml));

    await act(async () => {
      await expect(
        result.current.verifyCurrent(laidOut('<note><rest/></note>', true), baseXml),
      ).resolves.toMatchObject({ ok: true, matchedBy: 'content' });
    });
    expect(result.current.applyError).toBeNull();
  });

  it('follows the score through a partial Apply, and still stops a real edit', async () => {
    const baseXml = laidOut('<note><rest/></note>', false);
    const baseHash = await computeClientScoreHash(baseXml);
    const afterFirstBlock = laidOut('<note><pitch><step>C</step></pitch></note>', false);
    const { result } = renderHook(() => useAiProposalController());

    act(() => result.current.capture({ expectedCurrentContentHash: baseHash }, baseXml));
    await act(async () => {
      await result.current.recordAppliedXml(afterFirstBlock);
    });

    // The next block: the score is what the first Apply left, laid out again since.
    await act(async () => {
      await expect(
        result.current.verifyCurrent(
          laidOut('<note><pitch><step>C</step></pitch></note>', true),
          baseXml,
        ),
      ).resolves.toMatchObject({ ok: true, matchedBy: 'content' });
    });
    // Not the score from before that Apply, and not one somebody has since edited.
    await act(async () => {
      await expect(
        result.current.verifyCurrent(laidOut('<note><rest/></note>', true), baseXml),
      ).resolves.toMatchObject({ ok: false });
    });
    await act(async () => {
      await expect(
        result.current.verifyCurrent(
          laidOut('<note><pitch><step>D</step></pitch></note>', true),
          baseXml,
        ),
      ).resolves.toMatchObject({ ok: false });
    });
    expect(result.current.applyError).toBeTruthy();
  });

  it('forgets what it expected when told the expectation is void', async () => {
    const baseXml = laidOut('<note><rest/></note>', false);
    const baseHash = await computeClientScoreHash(baseXml);
    const { result } = renderHook(() => useAiProposalController());

    act(() => result.current.capture({ expectedCurrentContentHash: baseHash }, baseXml));
    await act(async () => {
      await result.current.recordAppliedXml(
        laidOut('<note><pitch><step>C</step></pitch></note>', false),
      );
    });
    act(() => result.current.invalidateExpectedCurrent('The next block cannot be verified.'));

    await act(async () => {
      await expect(
        result.current.verifyCurrent(
          laidOut('<note><pitch><step>C</step></pitch></note>', true),
          baseXml,
        ),
      ).resolves.toMatchObject({ ok: false });
    });
  });

  it('carries the expected score through a snapshot and back', async () => {
    const baseXml = laidOut('<note><rest/></note>', false);
    const baseHash = await computeClientScoreHash(baseXml);
    const { result } = renderHook(() => useAiProposalController());

    act(() => result.current.capture({ expectedCurrentContentHash: baseHash }, baseXml));
    const saved = result.current.snapshot();
    expect(saved.expectedCurrentXml).toBe(baseXml);

    act(() => result.current.clear());
    expect(result.current.snapshot().expectedCurrentXml).toBeNull();
    act(() => result.current.restore(saved));
    await act(async () => {
      await expect(
        result.current.verifyCurrent(laidOut('<note><rest/></note>', true), baseXml),
      ).resolves.toMatchObject({ ok: true });
    });
  });

  it('keeps refusing a proposal whose hashes are not those of the score it captured', async () => {
    // A proposal written against another score. The captured text matches the live score,
    // but it is not what the proposal expects, so it cannot vouch for it.
    const baseXml = laidOut('<note><rest/></note>', false);
    const { result } = renderHook(() => useAiProposalController());

    act(() =>
      result.current.capture(
        {
          expectedCurrentContentHash: 'sha256:of-some-other-score',
          expectedCurrentIdentityHash: 'xmlid-v1:of-some-other-score',
        },
        baseXml,
      ),
    );

    await act(async () => {
      await expect(
        result.current.verifyCurrent(laidOut('<note><rest/></note>', true), baseXml),
      ).resolves.toMatchObject({ ok: false });
    });
    await act(async () => {
      await expect(result.current.verifyCurrent(baseXml, baseXml)).resolves.toMatchObject({
        ok: false,
      });
    });
  });

  it('owns proposal-session continuity and clears it with the proposal', () => {
    const { result } = renderHook(() => useAiProposalController());
    const session = createClientProposalSession({
      originalInstruction: 'Transpose up.',
      includeChat: false,
    });

    act(() => {
      result.current.setSession(session);
      result.current.setAudit({ cycle: 1 });
    });
    expect(result.current.getSession()).toEqual(session);
    expect(result.current.audit).toEqual({ cycle: 1 });

    act(() => result.current.clear());
    expect(result.current.getSession()).toBeNull();
    expect(result.current.audit).toBeNull();
  });
});
