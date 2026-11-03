import { describe, expect, it } from 'vitest';
import { htmlToMarkup, htmlToPlain, markupOfTextElement, markupToHtml, symChipHtml } from '../../components/score-editor/rich-text';

const BASE = { family: 'Edwin', size: 10 };
const editor = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};
const roundTrip = (markup: string) => htmlToMarkup(editor(markupToHtml(markup)), BASE);

describe('MuseScore text markup ↔ editor HTML (E17)', () => {
  it('keeps bold, italic, underline, strikethrough, sub- and superscript through a round trip', () => {
    for (const markup of ['plain', '<b>bold</b> rest', 'a<i>b</i>c', '<b><i>both</i></b>', '<u>u</u><s>s</s>', 'x<sup>2</sup>', 'H<sub>2</sub>O']) {
      expect(roundTrip(markup)).toBe(markup);
    }
  });

  it('turns font switches into spans and back, returning to the element’s font after them', () => {
    const markup = 'a<font face="FreeSans"/>b<font face="Edwin"/>c';
    const html = markupToHtml(markup);
    expect(html).toContain('data-face="FreeSans"');
    expect(roundTrip(markup)).toBe(markup);
    expect(roundTrip('<font size="14"/>big')).toBe('<font size="14"/>big');
  });

  it('keeps a font switch across the style tags around it, as MuseScore reads them', () => {
    // The face set inside <b> still holds after </b>. The switch is written between runs: the same text to MuseScore.
    expect(roundTrip('<b>a<font face="FreeSans"/>b</b>c')).toBe('<b>a</b><font face="FreeSans"/><b>b</b>c');
  });

  it('shows symbols as chips that keep their name, and line feeds as breaks', () => {
    const html = markupToHtml('a<sym>dynamicForte</sym>\nb');
    expect(html).toContain('data-sym="dynamicForte"');
    expect(html).toContain('contenteditable="false"');
    expect(html).toContain('<br>');
    expect(roundTrip('a<sym>dynamicForte</sym>\nb')).toBe('a<sym>dynamicForte</sym>\nb');
  });

  it('escapes and unescapes &, < and >', () => {
    expect(roundTrip('a &amp; b &lt; c')).toBe('a &amp; b &lt; c');
    expect(htmlToPlain(editor(markupToHtml('a &amp; b')))).toBe('a & b');
  });

  it('reads what the browser’s formatting commands make: strong/em/strike, font tags, styled spans, divs', () => {
    expect(htmlToMarkup(editor('<strong>a</strong><em>b</em><strike>c</strike>'), BASE)).toBe('<b>a</b><i>b</i><s>c</s>');
    expect(htmlToMarkup(editor('<font face="FreeSans">x</font>y'), BASE)).toBe('<font face="FreeSans"/>x<font face="Edwin"/>y');
    expect(htmlToMarkup(editor('<span style="font-weight: bold">w</span>'), BASE)).toBe('<b>w</b>');
    expect(htmlToMarkup(editor('one<div>two</div><div><br></div>'), BASE)).toBe('one\ntwo');
  });

  it('merges adjacent runs of the same style', () => {
    expect(htmlToMarkup(editor('<b><i>a</i></b><b><i>b</i></b>'), BASE)).toBe('<b><i>ab</i></b>');
  });

  it('shows markup that does not parse as its text', () => {
    expect(markupToHtml('a <b>unclosed')).toBe('a &lt;b&gt;unclosed');
  });

  it('reads the markup inside an MSCX <text> (the selection’s copy data)', () => {
    const doc = new DOMParser().parseFromString('<Staff><StaffText><text><b>Dol</b>ce &amp; co</text></StaffText></Staff>', 'application/xml');
    expect(markupOfTextElement(doc.querySelector('text')!)).toBe('<b>Dol</b>ce &amp; co');
  });
});

describe('music symbols in the editor (E17)', () => {
  it('draws a symbol as its glyph where its code point is known, and saves it by name', () => {
    const html = markupToHtml('<sym>dynamicForte</sym>', { dynamicForte: 0xe522 });
    expect(html).toContain(String.fromCodePoint(0xe522));
    expect(html).toContain('title="dynamicForte"');
    expect(htmlToMarkup(editor(html), BASE)).toBe('<sym>dynamicForte</sym>');
    expect(htmlToMarkup(editor(symChipHtml('segno', 0xe047)), BASE)).toBe('<sym>segno</sym>');
  });
});
