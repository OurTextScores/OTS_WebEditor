// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyMusicXmlPatch, parseMusicXmlPatch } from '../../components/score-editor/musicxml';

const patch = (...ops: unknown[]) => JSON.stringify({ format: 'musicxml-patch@1', ops });

describe('parseMusicXmlPatch', () => {
  it('rejects an empty or non-JSON response', () => {
    expect(parseMusicXmlPatch('  ').error).toBe('AI response is empty.');
    expect(parseMusicXmlPatch('not json').error).toBe('AI response is not valid JSON.');
  });

  it('rejects JSON that is not a musicxml-patch@1 payload', () => {
    const wrong = 'AI response is not a musicxml-patch@1 payload.';
    expect(parseMusicXmlPatch('[]').error).toBe(wrong);
    expect(parseMusicXmlPatch('{"format":"other","ops":[]}').error).toBe(wrong);
    expect(parseMusicXmlPatch('{"format":"musicxml-patch@1"}').error).toBe(wrong);
  });

  it('accepts every op kind and keeps only the fields each one uses', () => {
    const result = parseMusicXmlPatch(
      patch(
        { op: 'setText', path: ' /a ', value: 'x', ignored: 1 },
        { op: 'setAttr', path: '/b', name: 'n', value: 'v' },
        { op: 'replace', path: '/c', value: '<e/>' },
        { op: 'insertBefore', path: '/d', value: '<e>t</e>' },
        { op: 'insertAfter', path: '/e', value: '<e><f/></e>' },
        { op: 'delete', path: '/f', value: 'dropped' },
      ),
    );
    expect(result.error).toBe('');
    expect(result.patch?.ops).toEqual([
      { op: 'setText', path: '/a', value: 'x' },
      { op: 'setAttr', path: '/b', name: 'n', value: 'v' },
      { op: 'replace', path: '/c', value: '<e/>' },
      { op: 'insertBefore', path: '/d', value: '<e>t</e>' },
      { op: 'insertAfter', path: '/e', value: '<e><f/></e>' },
      { op: 'delete', path: '/f' },
    ]);
  });

  it('names the failing op and the reason', () => {
    expect(parseMusicXmlPatch(patch('x')).error).toBe('Patch op 1 is not an object.');
    expect(parseMusicXmlPatch(patch({ op: 'move', path: '/a' })).error).toBe(
      'Patch op 1 has unsupported op "move".',
    );
    expect(parseMusicXmlPatch(patch({ op: 'delete', path: '  ' })).error).toBe(
      'Patch op 1 is missing a valid path.',
    );
    expect(parseMusicXmlPatch(patch({ op: 'setText', path: '/a' })).error).toBe(
      'Patch op 1 requires a string value.',
    );
    expect(
      parseMusicXmlPatch(
        patch({ op: 'delete', path: '/a' }, { op: 'setAttr', path: '/a', value: 'v' }),
      ).error,
    ).toBe('Patch op 2 requires an attribute name.');
    expect(parseMusicXmlPatch(patch({ op: 'setAttr', path: '/a', name: 'n' })).error).toBe(
      'Patch op 1 requires a string value.',
    );
  });

  it('keeps XML out of setText values', () => {
    expect(parseMusicXmlPatch(patch({ op: 'setText', path: '/a', value: '<b/>' })).error).toBe(
      'Patch op 1 setText value appears to contain XML. Use replace/insert ops for element changes.',
    );
  });

  it('requires exactly one balanced element in replace and insert values', () => {
    const error = (value: string) =>
      parseMusicXmlPatch(patch({ op: 'replace', path: '/a', value })).error;
    expect(error('<a/><b/>')).toBe(
      'Patch op 1 replace value has 2 top-level elements; expected exactly one. Use multiple ops for sibling elements.',
    );
    expect(error('')).toBe(
      'Patch op 1 replace value has 0 top-level elements; expected exactly one. Use multiple ops for sibling elements.',
    );
    expect(error('<a>')).toBe('Patch op 1 replace value has unbalanced XML tags.');
    expect(error('</a>')).toBe('Patch op 1 replace value has unbalanced XML tags.');
    expect(error('text<a/>')).toBe(
      'Patch op 1 replace value has top-level text; it must contain exactly one XML element.',
    );
    // comments and processing instructions around the element do not count
    expect(error('<!-- c --><a/>')).toBe('');
  });
});

const BASE =
  '<score-partwise><part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part></score-partwise>';
const apply = (...ops: Array<Record<string, string>>) =>
  applyMusicXmlPatch(BASE, { format: 'musicxml-patch@1', ops: ops as never });
const NOTE = '/score-partwise/part/measure/note';

describe('applyMusicXmlPatch', () => {
  it('refuses empty or malformed base XML', () => {
    expect(applyMusicXmlPatch('  ', { format: 'musicxml-patch@1', ops: [] })).toEqual({
      xml: '',
      error: 'Base MusicXML is empty.',
    });
    expect(applyMusicXmlPatch('<a>', { format: 'musicxml-patch@1', ops: [] })).toEqual({
      xml: '',
      error: 'Base MusicXML is not valid XML.',
    });
  });

  it('sets text, sets attributes and deletes', () => {
    const text = apply({ op: 'setText', path: `${NOTE}/pitch/step`, value: 'D' });
    expect(text.error).toBe('');
    expect(text.xml).toContain('<step>D</step>');

    const attr = apply({
      op: 'setAttr',
      path: '/score-partwise/part/measure',
      name: 'number',
      value: '9',
    });
    expect(attr.xml).toContain('<measure number="9">');

    const removed = apply({ op: 'delete', path: NOTE });
    expect(removed.xml).not.toContain('<note>');
  });

  it('replaces and inserts an element next to its target', () => {
    const replaced = apply({ op: 'replace', path: `${NOTE}/pitch`, value: '<rest/>' });
    expect(replaced.xml).toContain('<note><rest/></note>');

    const before = apply({ op: 'insertBefore', path: NOTE, value: '<direction/>' });
    expect(before.xml.indexOf('<direction/>')).toBeLessThan(before.xml.indexOf('<note>'));

    const after = apply({ op: 'insertAfter', path: NOTE, value: '<direction/>' });
    expect(after.xml.indexOf('<direction/>')).toBeGreaterThan(after.xml.indexOf('</note>'));
  });

  it('applies ops in order, each against the result of the last', () => {
    const result = apply(
      { op: 'insertAfter', path: NOTE, value: '<note><rest/></note>' },
      { op: 'setAttr', path: `${NOTE}[2]`, name: 'tagged', value: 'yes' },
    );
    expect(result.error).toBe('');
    expect(result.xml).toContain('<note tagged="yes"><rest/></note>');
  });

  it('creates a missing attributes element at the start of the measure for setText', () => {
    const result = apply({
      op: 'setText',
      path: '/score-partwise/part/measure/attributes/divisions',
      value: '4',
    });
    expect(result.error).toBe('');
    expect(result.xml).toContain(
      '<measure number="1"><attributes><divisions>4</divisions></attributes><note>',
    );
  });

  it('reports which op failed and why', () => {
    expect(apply({ op: 'delete', path: '/nope' }).error).toBe(
      'Patch op 1 failed: XPath "/nope" matched 0 nodes.',
    );
    expect(apply({ op: 'delete', path: '(((' }).error).toBe(
      'Patch op 1 failed: XPath "(((" could not be evaluated.',
    );
    const two = applyMusicXmlPatch('<r><n/><n/></r>', {
      format: 'musicxml-patch@1',
      ops: [{ op: 'delete', path: '/r/n' }],
    });
    expect(two.error).toBe('Patch op 1 failed: XPath "/r/n" matched 2 nodes.');
    expect(
      apply({ op: 'setAttr', path: `${NOTE}/pitch/step/text()`, name: 'a', value: 'b' }).error,
    ).toBe('Patch op 1 targets a non-element node.');
    expect(apply({ op: 'replace', path: NOTE, value: '<a/><b/>' }).error).toBe(
      'Patch op 1 failed: Patch value must contain exactly one element.',
    );
  });

  it('does not touch the base when an op fails', () => {
    const result = apply({ op: 'delete', path: NOTE }, { op: 'delete', path: '/nope' });
    expect(result.xml).toBe('');
  });
});
