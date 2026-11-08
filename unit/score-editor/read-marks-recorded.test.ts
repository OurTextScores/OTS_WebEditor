import { describe, expect, it } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import { proposalFromReading } from '../../components/score-editor/marks-review/readMarks';
import recorded from './read-marks-recorded.json';

/*
 * Real model answers (scripts/eval-read-marks.mts --record), replayed without a provider: whatever a model answered
 * correctly must still become the right proposal (an engraving of that kind, or a reminder kept as a mark). Catches
 * changes to the answer format, the vocabulary or the validation that would throw away good readings. Re-record after
 * changing the prompt.
 */
type Recording = {
  model: string;
  mode: string;
  fixture: string;
  accept: { kind: string; value?: string; style?: string }[];
  answer: string;
  correct: boolean;
};
const recordings = (recorded as { recordings: Recording[] }).recordings;

const mark: Annotation = {
  id: 'r',
  scoreKey: 's',
  scorePart: -1,
  kind: 'ink',
  anchor: { bar: 2, part: 0, tick: 0 },
  points: [[0, -2, 1]],
  style: { color: 'black', width: 0.2, opacity: 1 },
  createdAt: 0,
  extent: { start: { bar: 2, tick: 0 }, end: { bar: 3, tick: 0 } },
};

describe('recorded model readings', () => {
  it('cover several models, both pictures, and are mostly correct', () => {
    expect(new Set(recordings.map((r) => r.model)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(recordings.map((r) => r.mode))).toEqual(new Set(['music', 'staff']));
    expect(recordings.filter((r) => r.correct).length / recordings.length).toBeGreaterThan(0.9);
  });

  it.each(
    recordings
      .filter((r) => r.correct)
      .map((r) => [`${r.model} ${r.mode}: ${r.fixture}`, r] as const),
  )('%s', (_name, recording) => {
    const proposal = proposalFromReading(mark, recording.answer);
    const said = JSON.parse(
      recording.answer.slice(recording.answer.indexOf('{'), recording.answer.lastIndexOf('}') + 1),
    );
    if (said.kind === 'none') {
      expect(proposal).toMatchObject({ engrave: null, reason: 'reminder' });
    } else {
      expect(proposal.engrave?.kind).toBe(said.kind);
      expect(proposal.label).toMatch(/^AI: /);
    }
  });
});
