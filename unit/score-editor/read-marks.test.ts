import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../../components/performer/annotations/annotationModel';
import {
  barsXml,
  clearReadingCache,
  marksReaderFor,
  proposalFromReading,
  readMark,
  readPrompt,
  type MarksReader,
} from '../../components/score-editor/marks-review/readMarks';

const mark = (extra: Partial<Annotation>): Annotation => ({
  id: 'm1',
  scoreKey: 's',
  scorePart: -1,
  kind: 'text',
  content: 'très doux',
  anchor: { bar: 1, part: 0, tick: 240 },
  points: [[0, 6, 1]],
  style: { color: 'black', width: 0.2, opacity: 1 },
  createdAt: 0,
  ...extra,
});
const ink = (extra: Partial<Annotation> = {}) =>
  mark({
    kind: 'ink',
    content: undefined,
    points: [
      [0, 6, 1],
      [4, 7, 1],
    ],
    extent: { start: { bar: 1, tick: 0 }, end: { bar: 2, tick: 480 } },
    ...extra,
  });
const answer = (body: Record<string, unknown>) =>
  `Here you go: ${JSON.stringify({ confidence: 0.9, why: 'looks like it', style: '', value: '', ...body })}`;

const XML = `<score-partwise><part id="P1"><measure number="1">a</measure><measure number="2">b</measure><measure number="3">c</measure></part><part id="P2"><measure number="1">x</measure><measure number="2">y</measure></part></score-partwise>`;

describe('the bars sent with a mark', () => {
  it('takes each part’s bars by index', () => {
    const bars = barsXml(XML, 1, 2);
    expect(bars).toContain('<measure number="2">b</measure>');
    expect(bars).toContain('<measure number="3">c</measure>');
    expect(bars).toContain('<measure number="2">y</measure>');
    expect(bars).not.toContain('>a<');
  });

  it('says where the mark is and what was written', () => {
    const prompt = readPrompt(mark({}), 'BARS');
    expect(prompt).toContain('typed: "très doux"');
    expect(prompt).toContain('bar 2, 240 ticks');
    expect(prompt).toContain('BARS');
  });

  it('tells the model whether ink spans notes or sits at one', () => {
    expect(readPrompt(ink(), '')).toContain('spans from bar 2 (0 ticks in) to bar 3 (480 ticks in)');
    expect(readPrompt(ink({ extent: undefined }), '')).toContain('at a single note');
  });
});

describe('the model’s answer as a proposal', () => {
  it('takes text, with positions from the mark', () => {
    const proposal = proposalFromReading(
      mark({}),
      answer({ kind: 'text', value: 'très doux', style: 'expression' }),
    );
    expect(proposal.engrave).toMatchObject({
      kind: 'text',
      subtype: 'très doux',
      style: 'expression',
      bar: 1,
      tick: 240,
    });
    expect(proposal.label).toMatch(/^AI: Expression text “très doux” \(90% · looks like it\)$/);
  });

  it('engraves spanners only between the notes an ink stroke spans', () => {
    expect(
      proposalFromReading(ink(), answer({ kind: 'hairpin', value: 'dim' })).engrave,
    ).toMatchObject({
      kind: 'hairpin',
      subtype: 'dim',
      bar: 1,
      tick: 0,
      endBar: 2,
      endTick: 480,
    });
    expect(proposalFromReading(mark({}), answer({ kind: 'slur' })).engrave).toBeNull();
  });

  it('maps articulations and breaths to engine symbols, and checks values', () => {
    expect(
      proposalFromReading(ink(), answer({ kind: 'articulation', value: 'tenuto' })).engrave,
    ).toMatchObject({
      kind: 'articulation',
      subtype: 'articTenutoAbove',
    });
    expect(
      proposalFromReading(ink(), answer({ kind: 'breath', value: 'comma' })).engrave?.subtype,
    ).toBe('breathMarkComma');
    expect(
      proposalFromReading(ink(), answer({ kind: 'dynamic', value: 'loud' })).engrave,
    ).toBeNull();
    expect(
      proposalFromReading(ink(), answer({ kind: 'fingering', value: '7' })).engrave,
    ).toBeNull();
    expect(proposalFromReading(ink(), answer({ kind: 'cluster', value: '' })).engrave).toBeNull();
  });

  it('keeps reminders and unreadable answers as marks', () => {
    expect(proposalFromReading(mark({}), answer({ kind: 'none' }))).toMatchObject({
      engrave: null,
      reason: 'reminder',
    });
    expect(proposalFromReading(mark({}), 'I think it says dolce').engrave).toBeNull();
  });
});

describe('reading a mark', () => {
  beforeEach(() => clearReadingCache());

  it('asks once per model and mark, sending the bars it is in', async () => {
    const read = vi.fn<MarksReader['read']>(async () => answer({ kind: 'fermata' }));
    const reader: MarksReader = { label: 'x', cacheKey: 'openai:m', read };
    const first = await readMark(reader, ink(), XML);
    const second = await readMark(reader, ink(), XML);
    expect(first.engrave).toMatchObject({ kind: 'fermata' });
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0].promptText).toContain('<measure number="3">c</measure>');
    await readMark({ ...reader, cacheKey: 'openai:other' }, ink(), XML);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('keeps the mark and says why when the request fails (and asks again next time)', async () => {
    const read = vi.fn(async () => {
      throw new Error('401 bad key');
    });
    const proposal = await readMark({ label: 'x', cacheKey: 'k', read }, mark({}), XML);
    expect(proposal).toMatchObject({ engrave: null, label: 'AI request failed: 401 bad key' });
    await readMark({ label: 'x', cacheKey: 'k', read }, mark({}), XML);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('the editor’s AI settings as a reader', () => {
  const request = vi.fn(async () => ({ text: 'ok' }));
  it('exists only with a model and a key', async () => {
    expect(
      marksReaderFor({ enabled: true, provider: 'openai', apiKey: '', model: 'm', request }),
    ).toBeNull();
    expect(
      marksReaderFor({ enabled: true, provider: 'openai', apiKey: 'k', model: ' ', request }),
    ).toBeNull();
    const reader = marksReaderFor({
      enabled: true,
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude',
      request,
    })!;
    expect(reader.label).toBe('anthropic · claude');
    expect(await reader.read({ systemPrompt: 's', promptText: 'p', image: null })).toBe('ok');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        apiKey: 'k',
        model: 'claude',
        temperature: 0,
      }),
    );
  });
});
