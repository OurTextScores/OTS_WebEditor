import { describe, expect, it } from 'vitest';
import { convertMusicNotation, normalizeMusicFormat } from '../lib/music-conversion';

describe('music-conversion MVP', () => {
  it('normalizes ABC output and returns machine-readable validation report', async () => {
    const result = await convertMusicNotation({
      inputFormat: 'abc',
      outputFormat: 'abc',
      content: 'M:4/4\r\nK:C\r\nC D E F | G A B c |\r\n',
      deepValidate: false,
    });

    expect(result.content.startsWith('X:1\nT:Converted Score\n')).toBe(true);
    expect(result.normalization.schemaVersion).toBe('music-normalization@1');
    expect(result.normalization.format).toBe('abc');
    expect(
      result.normalization.actions.some((a) => a.id === 'ensure-abc-x-header' && a.applied),
    ).toBe(true);

    expect(result.validation.schemaVersion).toBe('music-validation@1');
    expect(result.validation.summary.error).toBeGreaterThanOrEqual(0);
    expect(result.validation.stages.outputShape).toBeDefined();
    expect(result.validation.stages.invariants).toBeDefined();
    expect(result.validation.checks.some((c) => c.id === 'invariant-meter-present')).toBe(true);
  });

  it('returns validation stages and invariants for MusicXML same-format normalization', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<score-partwise version="3.1">\r\n  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>\r\n  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes></measure></part>\r\n</score-partwise>`;
    const result = await convertMusicNotation({
      inputFormat: 'musicxml',
      outputFormat: 'musicxml',
      content: xml,
      deepValidate: false,
    });

    expect(result.content.endsWith('\n')).toBe(true);
    expect(result.normalization.format).toBe('musicxml');
    expect(result.validation.checks.some((c) => c.id === 'musicxml-root')).toBe(true);
    expect(result.validation.checks.some((c) => c.id === 'invariant-part-count')).toBe(true);
    expect(result.validation.stages.outputShape.checks.length).toBeGreaterThan(0);
    expect(result.validation.stages.invariants.checks.length).toBeGreaterThan(0);
  });

  it('normalizes same-format MIDI base64 and validates header', async () => {
    const midiBase64WithWhitespace = `${Buffer.from('MThd').toString('base64')}\n`;
    const result = await convertMusicNotation({
      inputFormat: 'midi',
      outputFormat: 'midi',
      content: midiBase64WithWhitespace,
      contentEncoding: 'base64',
      deepValidate: false,
    });

    expect(result.contentEncoding).toBe('base64');
    expect(result.content).toBe(Buffer.from('MThd').toString('base64'));
    expect(result.normalization.format).toBe('midi');
    expect(result.validation.checks.some((c) => c.id === 'midi-header')).toBe(true);
  });

  it('normalizes midi aliases through normalizeMusicFormat', () => {
    expect(normalizeMusicFormat('midi')).toBe('midi');
    expect(normalizeMusicFormat('mid')).toBe('midi');
  });

  it('normalizes kern aliases and validates same-format kern content', async () => {
    expect(normalizeMusicFormat('kern')).toBe('kern');
    expect(normalizeMusicFormat('krn')).toBe('kern');
    expect(normalizeMusicFormat('**kern')).toBe('kern');
    expect(normalizeMusicFormat('humdrum')).toBe('kern');

    const result = await convertMusicNotation({
      inputFormat: 'kern',
      outputFormat: 'kern',
      content: '**kern\r\n*M4/4\r\n=1\r\n4c\r\n*-\r\n',
      deepValidate: false,
    });

    expect(result.content.endsWith('\n')).toBe(true);
    expect(result.normalization.format).toBe('kern');
    expect(result.validation.checks.some((c) => c.id === 'kern-spine' && c.ok)).toBe(true);
    expect(result.validation.checks.some((c) => c.id === 'kern-terminator' && c.ok)).toBe(true);
  });

  it('repairs model-style kern that omits the spine declaration and terminator', async () => {
    const result = await convertMusicNotation({
      inputFormat: 'kern',
      outputFormat: 'kern',
      content: '*clefF4\t*clefG2\n*k[]\t*k[]\n*M4/4\t*M4/4\n16GGLL\t16ccLL\n=\t=\n',
      deepValidate: false,
    });

    expect(result.content).toBe(
      '**kern\t**kern\n*clefF4\t*clefG2\n*k[]\t*k[]\n*M4/4\t*M4/4\n16GGLL\t16ccLL\n=\t=\n*-\t*-\n',
    );
    expect(result.normalization.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'kern-spine-declaration', applied: true }),
        expect.objectContaining({ id: 'kern-spine-terminator', applied: true }),
      ]),
    );
    expect(result.validation.checks.some((c) => c.id === 'kern-spine' && c.ok)).toBe(true);
    expect(result.validation.checks.some((c) => c.id === 'kern-terminator' && c.ok)).toBe(true);
  });
});
