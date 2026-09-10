import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAiEditController } from '../components/score-editor/useAiEditController';
import { useAiProposalController } from '../components/score-editor/useAiProposalController';
import { computeClientScoreHash } from '../lib/ai-edit-proposal-client';
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
