import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEEP_EDIT_BASE_ID,
  DeepEditCapability,
  type DeepEditBudgets,
} from '../lib/music-services/deep-edit-capability';

const BASE_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>';

const budgets = (overrides: Partial<DeepEditBudgets> = {}): DeepEditBudgets => ({
  maxLlmCalls: 12,
  maxToolCalls: 24,
  maxCandidates: 4,
  maxRenders: 3,
  budgetMs: 60_000,
  maxCandidateBytes: 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
  ...overrides,
});

describe('DeepEditCapability', () => {
  let capability: DeepEditCapability | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    capability?.dispose();
    capability = null;
    vi.useRealTimers();
  });

  it('mints sequential candidate ids and resolves only base or minted ids', () => {
    capability = new DeepEditCapability({ baseXml: BASE_XML, budgets: budgets() });
    const first = capability.mintCandidate({
      parentId: DEEP_EDIT_BASE_ID,
      xml: `${BASE_XML}<!-- a -->`,
      createdByTool: 'apply_patch',
      verification: 'patch_apply',
    });
    expect(first).toMatchObject({ ok: true, candidate: { id: 'cand-1', parentId: 'base' } });

    expect(capability.isValidSourceId('base')).toBe(true);
    expect(capability.isValidSourceId('cand-1')).toBe(true);
    expect(capability.isValidSourceId('cand-2')).toBe(false);
    expect(capability.isValidSourceId('sess_user_live_session')).toBe(false);
    expect(capability.isValidSourceId('../artifacts/x.xml')).toBe(false);
    expect(capability.resolveXml('base')).toBe(BASE_XML);
    expect(capability.resolveXml('cand-1')).toContain('<!-- a -->');
    expect(capability.resolveXml('cand-99')).toBeNull();
  });

  it('enforces the candidate count limit', () => {
    capability = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets({ maxCandidates: 2 }),
    });
    for (let i = 0; i < 2; i += 1) {
      expect(
        capability.mintCandidate({
          parentId: DEEP_EDIT_BASE_ID,
          xml: `${BASE_XML}<!-- ${i} -->`,
          createdByTool: 'apply_patch',
          verification: 'patch_apply',
        }).ok,
      ).toBe(true);
    }
    expect(
      capability.mintCandidate({
        parentId: DEEP_EDIT_BASE_ID,
        xml: BASE_XML,
        createdByTool: 'apply_patch',
        verification: 'patch_apply',
      }),
    ).toEqual({ ok: false, reason: 'candidate_limit' });
  });

  it('enforces per-candidate and total byte limits', () => {
    capability = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets({ maxCandidateBytes: 300, maxTotalBytes: 500 }),
    });
    expect(
      capability.mintCandidate({
        parentId: DEEP_EDIT_BASE_ID,
        xml: 'x'.repeat(301),
        createdByTool: 'apply_patch',
        verification: 'patch_apply',
      }),
    ).toEqual({ ok: false, reason: 'candidate_bytes' });
    expect(
      capability.mintCandidate({
        parentId: DEEP_EDIT_BASE_ID,
        xml: 'x'.repeat(300),
        createdByTool: 'apply_patch',
        verification: 'patch_apply',
      }).ok,
    ).toBe(true);
    expect(
      capability.mintCandidate({
        parentId: DEEP_EDIT_BASE_ID,
        xml: 'y'.repeat(250),
        createdByTool: 'apply_patch',
        verification: 'patch_apply',
      }),
    ).toEqual({ ok: false, reason: 'total_bytes' });
    expect(capability.counters.candidateBytes).toBe(300);
  });

  it('charges request-wide llm, tool, and render budgets truthfully', () => {
    capability = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets({ maxLlmCalls: 2, maxToolCalls: 3, maxRenders: 1 }),
    });
    expect(capability.chargeLlmCall()).toEqual({ ok: true });
    expect(capability.chargeLlmCall()).toEqual({ ok: true });
    expect(capability.chargeLlmCall()).toEqual({ ok: false, reason: 'llm_calls' });
    expect(capability.chargeToolCall()).toEqual({ ok: true });
    expect(capability.chargeToolCall()).toEqual({ ok: true });
    expect(capability.chargeToolCall()).toEqual({ ok: true });
    expect(capability.chargeToolCall()).toEqual({ ok: false, reason: 'tool_calls' });
    expect(capability.chargeRender()).toEqual({ ok: true });
    expect(capability.chargeRender()).toEqual({ ok: false, reason: 'renders' });
    expect(capability.counters).toMatchObject({ llmCalls: 2, toolCalls: 3, renders: 1 });
  });

  it('aborts its signal at the deadline and refuses further charges', () => {
    capability = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets({ budgetMs: 5_000 }),
    });
    expect(capability.signal.aborted).toBe(false);
    vi.advanceTimersByTime(5_001);
    expect(capability.signal.aborted).toBe(true);
    expect(capability.expired()).toBe(true);
    expect(capability.chargeLlmCall()).toEqual({ ok: false, reason: 'deadline' });
    expect(capability.chargeToolCall()).toEqual({ ok: false, reason: 'deadline' });
  });

  it('chains an already-aborted or later-aborted parent signal', () => {
    const parent = new AbortController();
    capability = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets(),
      parentSignal: parent.signal,
    });
    expect(capability.signal.aborted).toBe(false);
    parent.abort(new Error('client went away'));
    expect(capability.signal.aborted).toBe(true);

    const preAborted = new AbortController();
    preAborted.abort();
    const second = new DeepEditCapability({
      baseXml: BASE_XML,
      budgets: budgets(),
      parentSignal: preAborted.signal,
    });
    expect(second.signal.aborted).toBe(true);
    second.dispose();
  });

  it('tracks per-candidate verification upgrades and the strongest attempted level', () => {
    capability = new DeepEditCapability({ baseXml: BASE_XML, budgets: budgets() });
    const minted = capability.mintCandidate({
      parentId: DEEP_EDIT_BASE_ID,
      xml: BASE_XML,
      createdByTool: 'scoreops',
      verification: 'tool_execution',
    });
    if (!minted.ok) {
      throw new Error('expected mint');
    }
    expect(capability.strongestAttemptedLevel()).toBe('tool_execution');

    capability.recordVerification(minted.candidate.id, 'engine_load');
    expect(capability.getCandidate(minted.candidate.id)?.verification).toBe('engine_load');
    expect(capability.strongestAttemptedLevel()).toBe('engine_load');

    // A failed engine check records the error without upgrading anything.
    capability.recordVerification(minted.candidate.id, 'engine_load', 'load failed: bad measure');
    expect(capability.getCandidate(minted.candidate.id)?.engineError).toContain('bad measure');

    capability.recordVerification(minted.candidate.id, 'render');
    expect(capability.getCandidate(minted.candidate.id)?.verification).toBe('render');
    expect(capability.getCandidate(minted.candidate.id)?.engineError).toBeUndefined();
    // Downgrades never happen.
    capability.recordVerification(minted.candidate.id, 'patch_apply');
    expect(capability.getCandidate(minted.candidate.id)?.verification).toBe('render');
  });

  it('records bounded scores and exposes metadata-only audit entries', () => {
    capability = new DeepEditCapability({ baseXml: BASE_XML, budgets: budgets() });
    const minted = capability.mintCandidate({
      parentId: DEEP_EDIT_BASE_ID,
      xml: BASE_XML,
      createdByTool: 'apply_patch',
      patch: { format: 'musicxml-patch@1', ops: [] },
      verification: 'patch_apply',
    });
    if (!minted.ok) {
      throw new Error('expected mint');
    }
    expect(
      capability.recordScore(minted.candidate.id, {
        kind: 'self_assessment',
        value: 'good voice leading',
        detail: 'd'.repeat(1_000),
      }),
    ).toBe(true);
    expect(capability.recordScore('cand-99', { kind: 'x', value: 1 })).toBe(false);

    const audit = capability.auditCandidates();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      id: minted.candidate.id,
      parentId: 'base',
      createdByTool: 'apply_patch',
      verification: 'patch_apply',
    });
    expect(audit[0].scores[0].detail).toHaveLength(500);
    expect(JSON.stringify(audit[0])).not.toContain('<score-partwise');
  });
});
