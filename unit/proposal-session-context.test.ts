import { describe, expect, it } from 'vitest';

import { computeMusicXmlIdentityHashServer } from '../lib/musicxml-identity-server';
import { computeScoreHash } from '../lib/music-services/scoreops-session-store';
import {
  createProposalContinuityToken,
  evaluateProposalLineage,
  parseProposalSessionContext,
  verifyProposalContinuityToken,
  type ProposalPreviousCycle,
} from '../lib/music-services/proposal-session-context';

const BASE_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>';
const PROPOSED_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"><note/></measure></part></score-partwise>';
const OTHER_XML =
  '<score-partwise version="4.0"><part-list/><part id="P1"><measure number="2"/></part></score-partwise>';

const VALID_PATCH = {
  format: 'musicxml-patch@1',
  ops: [{ op: 'setText', path: '/score-partwise/part/measure/note/duration', value: '2' }],
};

const validPreviousCycle = (overrides: Record<string, unknown> = {}) => ({
  cycle: 1,
  baseContentHash: computeScoreHash(BASE_XML),
  baseIdentityHash: computeMusicXmlIdentityHashServer(BASE_XML),
  proposedContentHash: computeScoreHash(PROPOSED_XML),
  proposedIdentityHash: computeMusicXmlIdentityHashServer(PROPOSED_XML),
  patch: VALID_PATCH,
  annotations: [{ part: 1, measure: 3, comment: 'Raised the third.' }],
  ...overrides,
});

const validInput = (overrides: Record<string, unknown> = {}) => ({
  id: 'sess-abc.123',
  cycle: 1,
  originalInstruction: 'Transpose the melody up a third.',
  previousCycle: validPreviousCycle(),
  constraints: [
    { cycle: 1, kind: 'rejected', partIndex: 0, measureRange: '3-4', text: '' },
    { cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: 'Keep dynamics gentle.' },
  ],
  ...overrides,
});

describe('parseProposalSessionContext', () => {
  it('returns null context when absent', () => {
    const result = parseProposalSessionContext(undefined, { iteration: 0 });
    expect(result).toMatchObject({ context: null, flags: { provided: false, lineage: 'none' } });
  });

  it('parses a valid context with previous cycle and constraints', () => {
    const result = parseProposalSessionContext(validInput(), { iteration: 0 });
    if (!('context' in result) || !result.context) {
      throw new Error(`expected context, got ${JSON.stringify(result)}`);
    }
    expect(result.context.id).toBe('sess-abc.123');
    expect(result.context.cycle).toBe(1);
    expect(result.context.originalInstruction).toContain('Transpose');
    expect(result.context.previousCycle?.patchJson).toContain('musicxml-patch@1');
    expect(result.context.previousCycle?.annotations).toEqual([
      { partIndex: 0, measure: 3, comment: 'Raised the third.' },
    ]);
    expect(result.context.constraints).toHaveLength(2);
    expect(result.flags.truncated).toEqual([]);
  });

  it.each([
    ['bad id', validInput({ id: 'bad id with spaces' }), 'id'],
    ['cycle zero', validInput({ cycle: 0 }), 'cycle'],
    ['cycle/iteration mismatch', validInput({ cycle: 3 }), 'iteration'],
    [
      'previousCycle cycle mismatch',
      validInput({ previousCycle: validPreviousCycle({ cycle: 2 }) }),
      'previousCycle.cycle',
    ],
    [
      'previousCycle missing hashes',
      validInput({ previousCycle: validPreviousCycle({ baseContentHash: 'nope' }) }),
      'hashes',
    ],
    [
      'previousCycle bad patch',
      validInput({ previousCycle: validPreviousCycle({ patch: { format: 'other' } }) }),
      'patch',
    ],
    ['constraints not array', validInput({ constraints: 'nope' }), 'constraints'],
    [
      'constraint bad kind',
      validInput({ constraints: [{ cycle: 1, kind: 'weird', text: 'x' }] }),
      'kind',
    ],
    [
      'constraint future cycle',
      validInput({ constraints: [{ cycle: 5, kind: 'note', text: 'x' }] }),
      'cycle',
    ],
  ])('rejects structural violation: %s', (_label, input, errorFragment) => {
    const result = parseProposalSessionContext(input, { iteration: 0 });
    expect('error' in result && result.error).toContain(errorFragment);
  });

  it('truncates oversized instruction deterministically and flags it', () => {
    const result = parseProposalSessionContext(
      validInput({ originalInstruction: 'x'.repeat(10_000) }),
      { iteration: 0 },
    );
    if (!('context' in result) || !result.context) {
      throw new Error('expected context');
    }
    expect(result.context.originalInstruction).toHaveLength(4_000);
    expect(result.flags.truncated).toContain('originalInstruction');
  });

  it('omits an oversized previous patch instead of truncating its JSON', () => {
    const hugePatch = {
      format: 'musicxml-patch@1',
      ops: Array.from({ length: 2_000 }, (_, i) => ({
        op: 'setText',
        path: `/score-partwise/part/measure[@number='${i}']/note/duration`,
        value: 'x'.repeat(60),
      })),
    };
    const result = parseProposalSessionContext(
      validInput({ previousCycle: validPreviousCycle({ patch: hugePatch }) }),
      { iteration: 0 },
    );
    if (!('context' in result) || !result.context) {
      throw new Error('expected context');
    }
    expect(result.context.previousCycle?.patchJson).toBe('');
    expect(result.flags.truncated).toContain('previousPatch');
  });

  it('keeps the most recent constraints when over the cap', () => {
    const constraints = Array.from({ length: 200 }, (_, i) => ({
      cycle: 1 + Math.floor(i / 100),
      kind: 'note',
      partIndex: null,
      measureRange: null,
      text: `constraint ${i}`,
    }));
    const result = parseProposalSessionContext(
      validInput({ cycle: 2, previousCycle: validPreviousCycle({ cycle: 2 }), constraints }),
      { iteration: 1 },
    );
    if (!('context' in result) || !result.context) {
      throw new Error('expected context');
    }
    expect(result.context.constraints).toHaveLength(120);
    expect(result.context.constraints.at(-1)?.text).toBe('constraint 199');
    expect(result.context.constraints[0]?.text).toBe('constraint 80');
    expect(result.flags.truncated).toContain('constraints');
  });

  it('enforces the aggregate context budget with deterministic drop order', () => {
    const previous = process.env.MUSIC_FEEDBACK_CONTEXT_MAX_CHARS;
    process.env.MUSIC_FEEDBACK_CONTEXT_MAX_CHARS = '10000';
    try {
      const bigPatch = {
        format: 'musicxml-patch@1',
        ops: [
          {
            op: 'setText',
            path: '/score-partwise/part/measure/note/duration',
            value: 'x'.repeat(6_000),
          },
        ],
      };
      const manyConstraints = Array.from({ length: 40 }, (_, i) => ({
        cycle: 1,
        kind: 'note',
        partIndex: null,
        measureRange: null,
        text: `${i}-`.padEnd(200, 'c'),
      }));
      const overBudget = parseProposalSessionContext(
        validInput({
          previousCycle: validPreviousCycle({ patch: bigPatch }),
          constraints: manyConstraints,
        }),
        { iteration: 0 },
      );
      if (!('context' in overBudget) || !overBudget.context) {
        throw new Error('expected context');
      }
      expect(overBudget.flags.truncated).toContain('constraints');
      expect(overBudget.context.constraints.length).toBeLessThan(40);
      expect(overBudget.context.constraints.at(-1)?.text.startsWith('39-')).toBe(true);
      expect(overBudget.context.previousCycle?.patchJson).toContain('musicxml-patch@1');

      const patchOverBudget = parseProposalSessionContext(
        validInput({
          originalInstruction: 'x'.repeat(3_900),
          previousCycle: validPreviousCycle({
            patch: {
              format: 'musicxml-patch@1',
              ops: [{ op: 'setText', path: '/x', value: 'y'.repeat(9_000) }],
            },
          }),
          constraints: [],
        }),
        { iteration: 0 },
      );
      if (!('context' in patchOverBudget) || !patchOverBudget.context) {
        throw new Error('expected context');
      }
      expect(patchOverBudget.context.previousCycle?.patchJson).toBe('');
      expect(patchOverBudget.flags.truncated).toContain('previousPatch');
    } finally {
      if (previous === undefined) {
        delete process.env.MUSIC_FEEDBACK_CONTEXT_MAX_CHARS;
      } else {
        process.env.MUSIC_FEEDBACK_CONTEXT_MAX_CHARS = previous;
      }
    }
  });

  it('sanitizes control characters and drops empty constraints', () => {
    const result = parseProposalSessionContext(
      validInput({
        originalInstruction: 'line\u0000one\u0007 two',
        constraints: [
          { cycle: 1, kind: 'note', partIndex: null, measureRange: null, text: '\u0000 \u0007 ' },
        ],
      }),
      { iteration: 0 },
    );
    if (!('context' in result) || !result.context) {
      throw new Error('expected context');
    }
    expect(result.context.originalInstruction).toBe('line one two');
    expect(result.context.constraints).toHaveLength(0);
  });
});

describe('evaluateProposalLineage', () => {
  const SESSION = { proposalSessionId: 'sess-lineage-1', cycle: 1 };
  const tokenFor = (base: string, proposed: string) =>
    createProposalContinuityToken({
      proposalSessionId: SESSION.proposalSessionId,
      cycle: SESSION.cycle,
      baseContentHash: computeScoreHash(base),
      proposedContentHash: computeScoreHash(proposed),
    });
  const previousCycle = (
    overrides: Partial<ProposalPreviousCycle> = {},
  ): ProposalPreviousCycle => ({
    cycle: 1,
    baseContentHash: computeScoreHash(BASE_XML),
    baseIdentityHash: computeMusicXmlIdentityHashServer(BASE_XML),
    proposedContentHash: computeScoreHash(PROPOSED_XML),
    proposedIdentityHash: computeMusicXmlIdentityHashServer(PROPOSED_XML),
    expectedCurrentContentHash: null,
    expectedCurrentIdentityHash: null,
    continuityToken: null,
    patchJson: '',
    annotations: [],
    ...overrides,
  });

  it('returns none without a previous cycle', () => {
    expect(evaluateProposalLineage(BASE_XML, null)).toEqual({
      lineage: 'none',
      continuity: 'none',
    });
  });

  it('marks a base match as client_attested when no continuity token is present', () => {
    expect(evaluateProposalLineage(BASE_XML, previousCycle(), SESSION)).toEqual({
      lineage: 'client_attested',
      continuity: 'client',
    });
  });

  it('verifies base and proposal matches when the server continuity token checks out', () => {
    const withToken = previousCycle({ continuityToken: tokenFor(BASE_XML, PROPOSED_XML) });
    expect(evaluateProposalLineage(BASE_XML, withToken, SESSION)).toEqual({
      lineage: 'verified',
      continuity: 'server',
    });
    expect(evaluateProposalLineage(PROPOSED_XML, withToken, SESSION)).toEqual({
      lineage: 'verified',
      continuity: 'server',
    });
  });

  it('keeps a partial-apply expectation match client_attested even with a valid token', () => {
    const result = evaluateProposalLineage(
      OTHER_XML,
      previousCycle({
        continuityToken: tokenFor(BASE_XML, PROPOSED_XML),
        expectedCurrentContentHash: computeScoreHash(OTHER_XML),
      }),
      SESSION,
    );
    expect(result).toEqual({ lineage: 'client_attested', continuity: 'server' });
  });

  it('treats a token bound to different hashes or session as client continuity', () => {
    const foreignToken = createProposalContinuityToken({
      proposalSessionId: 'someone-else',
      cycle: 1,
      baseContentHash: computeScoreHash(BASE_XML),
      proposedContentHash: computeScoreHash(PROPOSED_XML),
    });
    expect(
      evaluateProposalLineage(BASE_XML, previousCycle({ continuityToken: foreignToken }), SESSION),
    ).toEqual({ lineage: 'client_attested', continuity: 'client' });
  });

  it('matches identity hashes when raw bytes drifted', () => {
    const reserialized = `${BASE_XML}\n`;
    expect(computeScoreHash(reserialized)).not.toBe(computeScoreHash(BASE_XML));
    expect(evaluateProposalLineage(reserialized, previousCycle(), SESSION).lineage).toBe(
      'client_attested',
    );
  });

  it('reports mismatch when no hash matches', () => {
    expect(evaluateProposalLineage(OTHER_XML, previousCycle(), SESSION).lineage).toBe('mismatch');
  });

  it('reports mismatch for unparseable current XML instead of throwing', () => {
    expect(
      evaluateProposalLineage('<score-partwise><unclosed>', previousCycle(), SESSION).lineage,
    ).toBe('mismatch');
  });
});

describe('continuity tokens', () => {
  it('round-trips and rejects tampering', () => {
    const args = {
      proposalSessionId: 'sess-token-1',
      cycle: 2,
      baseContentHash: computeScoreHash(BASE_XML),
      proposedContentHash: computeScoreHash(PROPOSED_XML),
    };
    const token = createProposalContinuityToken(args);
    expect(token).toMatch(/^pct-v1:[0-9a-f]{64}$/);
    expect(verifyProposalContinuityToken(token, args)).toBe(true);
    expect(verifyProposalContinuityToken(token, { ...args, cycle: 3 })).toBe(false);
    expect(verifyProposalContinuityToken(token, { ...args, proposalSessionId: 'other' })).toBe(
      false,
    );
    const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    expect(verifyProposalContinuityToken(tampered, args)).toBe(false);
    expect(verifyProposalContinuityToken(null, args)).toBe(false);
  });
});
