import { describe, expect, it } from 'vitest';

import {
  accumulateProposalConstraints,
  advanceClientProposalSession,
  buildProposalSessionRequestPayload,
  createClientProposalSession,
  type ProposalConstraint,
} from '../lib/proposal-session-client';

const HASHES = {
  baseContentHash: 'sha256:'.padEnd(71, 'a'),
  baseIdentityHash: 'xmlid-v1:'.padEnd(73, 'b'),
  proposedContentHash: 'sha256:'.padEnd(71, 'c'),
  proposedIdentityHash: 'xmlid-v1:'.padEnd(73, 'd'),
};

describe('createClientProposalSession', () => {
  it('adopts the server session id and captures cycle-1 context', () => {
    const session = createClientProposalSession({
      id: 'server-id-1',
      originalInstruction: 'Add a coda.',
      includeChat: true,
      proposal: HASHES,
      patch: { format: 'musicxml-patch@1', ops: [] },
      annotations: [{ partIndex: 0, measure: 2, comment: 'Added coda sign.' }],
    });
    expect(session).toMatchObject({
      id: 'server-id-1',
      cycle: 1,
      includeChat: true,
      previousCycle: {
        cycle: 1,
        baseContentHash: HASHES.baseContentHash,
        proposedContentHash: HASHES.proposedContentHash,
      },
      constraints: [],
    });
  });

  it('generates a local id when the server did not mint one', () => {
    const session = createClientProposalSession({
      originalInstruction: 'x',
      includeChat: false,
    });
    expect(session.id.length).toBeGreaterThan(0);
    expect(session.previousCycle).toBeNull();
  });

  it('omits the previous cycle when proposal hashes are missing', () => {
    const session = createClientProposalSession({
      originalInstruction: 'x',
      includeChat: false,
      proposal: { baseContentHash: HASHES.baseContentHash },
    });
    expect(session.previousCycle).toBeNull();
  });
});

describe('accumulateProposalConstraints', () => {
  const rejected = (partIndex: number, measureRange: string, cycle = 1): ProposalConstraint => ({
    cycle,
    kind: 'rejected',
    partIndex,
    measureRange,
    text: '',
  });

  it('accumulates rejected blocks and global notes across cycles', () => {
    const cycle1 = accumulateProposalConstraints(
      [],
      1,
      [
        { partIndex: 0, measureRange: '3-4', status: 'rejected' },
        { partIndex: 0, measureRange: '5-6', status: 'accepted' },
      ],
      'No slurs.',
    );
    expect(cycle1).toEqual([
      rejected(0, '3-4'),
      { cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: 'No slurs.' },
    ]);

    const cycle2 = accumulateProposalConstraints(
      cycle1,
      2,
      [{ partIndex: 1, measureRange: '8-8', status: 'rejected' }],
      '',
    );
    expect(cycle2).toHaveLength(3);
    expect(cycle2.at(-1)).toEqual(rejected(1, '8-8', 2));
  });

  it('replaces an earlier rejection when a later cycle explicitly re-reviews the same block', () => {
    const existing = [rejected(0, '3-4'), rejected(1, '8-8')];
    const next = accumulateProposalConstraints(
      existing,
      2,
      [
        {
          partIndex: 0,
          measureRange: '3-4',
          status: 'comment',
          comment: 'Actually revise this one.',
        },
      ],
      '',
    );
    expect(next).toEqual([
      rejected(1, '8-8'),
      {
        cycle: 2,
        kind: 'note',
        partIndex: 0,
        measureRange: '3-4',
        text: 'Actually revise this one.',
      },
    ]);
  });

  it('accumulates block revision comments as located notes', () => {
    const next = accumulateProposalConstraints(
      [],
      1,
      [{ partIndex: 0, measureRange: '5-6', status: 'comment', comment: 'Make this legato.' }],
      '',
    );
    expect(next).toEqual([
      { cycle: 1, kind: 'note', partIndex: 0, measureRange: '5-6', text: 'Make this legato.' },
    ]);
  });

  it('never reverses a constraint for a pending (undecided) block', () => {
    const existing = [
      rejected(0, '3-4'),
      {
        cycle: 1,
        kind: 'note' as const,
        partIndex: 0,
        measureRange: '5-6',
        text: 'Make this legato.',
      },
    ];
    const next = accumulateProposalConstraints(
      existing,
      2,
      [
        { partIndex: 0, measureRange: '3-4', status: 'pending' },
        { partIndex: 0, measureRange: '5-6', status: 'pending' },
      ],
      '',
    );
    expect(next).toEqual(existing);
  });

  it('clears located constraints when the user accepts that block', () => {
    const existing = [
      rejected(0, '3-4'),
      {
        cycle: 1,
        kind: 'note' as const,
        partIndex: 0,
        measureRange: '5-6',
        text: 'Make this legato.',
      },
    ];
    const next = accumulateProposalConstraints(
      existing,
      2,
      [
        { partIndex: 0, measureRange: '3-4', status: 'accepted' },
        { partIndex: 0, measureRange: '5-6', status: 'accepted' },
      ],
      '',
    );
    expect(next).toEqual([]);
  });

  it('refreshes rather than duplicates a repeated rejection, and dedupes global notes', () => {
    const existing = [rejected(0, '3-4')];
    const next = accumulateProposalConstraints(
      existing,
      2,
      [{ partIndex: 0, measureRange: '3-4', status: 'rejected' }],
      '',
    );
    expect(next).toEqual([rejected(0, '3-4', 2)]);
    const withNote = accumulateProposalConstraints(
      [{ cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: 'No slurs.' }],
      2,
      [],
      'No slurs.',
    );
    expect(withNote).toHaveLength(1);
  });

  it('caps the constraint list keeping the most recent entries', () => {
    const existing = Array.from({ length: 120 }, (_, i) => rejected(0, `${i}-${i}`));
    const next = accumulateProposalConstraints(
      existing,
      3,
      [{ partIndex: 9, measureRange: '900-901', status: 'rejected' }],
      '',
    );
    expect(next).toHaveLength(120);
    expect(next.at(-1)).toEqual(rejected(9, '900-901', 3));
    expect(next[0]).toEqual(rejected(0, '1-1'));
  });
});

describe('advanceClientProposalSession', () => {
  it('advances the cycle, replaces the previous-cycle snapshot, and folds in feedback', () => {
    const session = createClientProposalSession({
      id: 's1',
      originalInstruction: 'Add a coda.',
      includeChat: false,
      proposal: HASHES,
      patch: { format: 'musicxml-patch@1', ops: [] },
    });
    const advanced = advanceClientProposalSession(session, {
      responseId: 's1',
      newCycle: 2,
      proposal: { ...HASHES, proposedContentHash: 'sha256:'.padEnd(71, 'e') },
      patch: { format: 'musicxml-patch@1', ops: [{ op: 'delete', path: '/x' }] },
      annotations: [],
      sentBlocks: [{ partIndex: 0, measureRange: '3-4', status: 'rejected' }],
      sentGlobalComment: 'Keep it quiet.',
    });
    expect(advanced.cycle).toBe(2);
    expect(advanced.previousCycle).toMatchObject({
      cycle: 2,
      proposedContentHash: 'sha256:'.padEnd(71, 'e'),
    });
    expect(advanced.constraints).toEqual([
      { cycle: 1, kind: 'rejected', partIndex: 0, measureRange: '3-4', text: '' },
      { cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: 'Keep it quiet.' },
    ]);
    expect(advanced.originalInstruction).toBe('Add a coda.');
  });
});

describe('buildProposalSessionRequestPayload', () => {
  it('shapes the request field with apply-gate expectations', () => {
    const session = createClientProposalSession({
      id: 's1',
      originalInstruction: 'Add a coda.',
      includeChat: false,
      proposal: HASHES,
      patch: { format: 'musicxml-patch@1', ops: [] },
    });
    const payload = buildProposalSessionRequestPayload(session, {
      contentHash: 'sha256:'.padEnd(71, 'f'),
      identityHash: null,
    });
    expect(payload).toMatchObject({
      id: 's1',
      cycle: 1,
      originalInstruction: 'Add a coda.',
      previousCycle: {
        cycle: 1,
        baseContentHash: HASHES.baseContentHash,
        expectedCurrentContentHash: 'sha256:'.padEnd(71, 'f'),
        expectedCurrentIdentityHash: null,
      },
      constraints: [],
    });
  });

  it('omits previousCycle when the session has none', () => {
    const session = createClientProposalSession({ originalInstruction: 'x', includeChat: false });
    const payload = buildProposalSessionRequestPayload(session, {
      contentHash: null,
      identityHash: null,
    });
    expect(payload.previousCycle).toBeUndefined();
  });
});
