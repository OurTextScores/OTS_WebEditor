/**
 * MuseScore's text markup (TextBase::xmlText) and the inline editor's HTML, both ways (roadmap E17). The markup:
 * `<b> <i> <u> <s> <sub> <sup>` nested properly; `<font face="…"/>` and `<font size="…"/>` switch the font from there
 * on (empty tags, however the style tags nest); `<sym>name</sym>` a music symbol; a line feed a new line; XML entities.
 * In the editor a font switch becomes a span carrying it, and a symbol a chip that is not edited (it keeps its name).
 */

/** The element's own font, which markup without a `<font>` switch is in. */
export interface BaseFont {
  family: string;
  size: number;
}

interface Run {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  valign: 'sub' | 'sup' | null;
  family: string | null;
  size: number | null;
  /** Text, a line break, or a symbol by name. */
  text?: string;
  newline?: boolean;
  sym?: string;
}

const STYLE_TAGS = new Set(['b', 'i', 'u', 's', 'sub', 'sup']);

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeHtml = (text: string) => escapeXml(text).replace(/"/g, '&quot;');

/** The markup inside an MSCX `<text>` element (the selection's copy data): its children, serialised as written. */
export function markupOfTextElement(text: Element): string {
  const serializer = new XMLSerializer();
  return [...text.childNodes]
    .map((node) =>
      node.nodeType === Node.TEXT_NODE
        ? escapeXml(node.textContent ?? '')
        : serializer.serializeToString(node),
    )
    .join('')
    .trim();
}

/**
 * A music symbol in the editor: a chip that is not edited, saved as `<sym>name</sym>`. With its SMuFL code point it
 * shows the glyph in a music font (named in the tooltip), else the name.
 */
export function symChipHtml(name: string, code?: number): string {
  const glyph = code
    ? `<span style="font-family:'BravuraFallback'">${escapeHtml(String.fromCodePoint(code))}</span>`
    : escapeHtml(name);
  return `<span data-sym="${escapeHtml(name)}" contenteditable="false" class="rich-text-sym" title="${escapeHtml(name)}">${glyph}</span>`;
}

/** Markup to the editor's HTML (symbols drawn from `codes` where given). Markup that does not parse is shown as its text. */
export function markupToHtml(markup: string, codes?: Readonly<Record<string, number>>): string {
  const doc = new DOMParser().parseFromString(`<data>${markup}</data>`, 'application/xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'data' || doc.getElementsByTagName('parsererror').length) {
    return escapeHtml(markup).replace(/\n/g, '<br>');
  }
  // A font switch holds from where it is until the next one, across the style tags around it.
  const font: { family: string | null; size: number | null } = { family: null, size: null };
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? '').split('\n').map(escapeHtml);
      const html = parts.join('<br>');
      if (!html || (font.family === null && font.size === null)) return html;
      const style = [
        font.family ? `font-family:'${font.family.replace(/'/g, '')}'` : '',
        font.size ? `font-size:${font.size}pt` : '',
      ]
        .filter(Boolean)
        .join(';');
      const data = `${font.family ? ` data-face="${escapeHtml(font.family)}"` : ''}${font.size ? ` data-size="${font.size}"` : ''}`;
      return `<span${data} style="${style}">${html}</span>`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as Element;
    const name = element.nodeName.toLowerCase();
    if (name === 'font') {
      const face = element.getAttribute('face');
      const size = Number(element.getAttribute('size'));
      if (face) font.family = face;
      if (Number.isFinite(size) && size > 0) font.size = size;
      return '';
    }
    if (name === 'sym') {
      const symbol = element.textContent ?? '';
      return symChipHtml(symbol, codes?.[symbol]);
    }
    const inner = [...element.childNodes].map(walk).join('');
    return STYLE_TAGS.has(name) ? `<${name}>${inner}</${name}>` : inner;
  };
  return [...root.childNodes].map(walk).join('');
}

const BLOCKS = new Set(['DIV', 'P']);

/** The format a node's text has, from its ancestors up to the editor root (tags, the editor's spans, inline styles). */
function formatAt(node: Node, root: Node): Omit<Run, 'text' | 'newline' | 'sym'> {
  const run: Omit<Run, 'text' | 'newline' | 'sym'> = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    valign: null,
    family: null,
    size: null,
  };
  for (
    let n: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
    n && n !== root;
    n = n.parentNode
  ) {
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const el = n as HTMLElement;
    const tag = el.tagName;
    const style = el.style;
    if (
      tag === 'B' ||
      tag === 'STRONG' ||
      Number(style.fontWeight) >= 600 ||
      style.fontWeight === 'bold'
    )
      run.bold = true;
    if (tag === 'I' || tag === 'EM' || style.fontStyle === 'italic') run.italic = true;
    if (
      tag === 'U' ||
      style.textDecoration.includes('underline') ||
      style.textDecorationLine.includes('underline')
    )
      run.underline = true;
    if (
      tag === 'S' ||
      tag === 'STRIKE' ||
      tag === 'DEL' ||
      style.textDecoration.includes('line-through') ||
      style.textDecorationLine.includes('line-through')
    ) {
      run.strike = true;
    }
    if (run.valign === null && (tag === 'SUP' || style.verticalAlign === 'super'))
      run.valign = 'sup';
    if (run.valign === null && (tag === 'SUB' || style.verticalAlign === 'sub')) run.valign = 'sub';
    if (run.family === null) {
      const face =
        el.dataset.face ??
        (tag === 'FONT' ? el.getAttribute('face') : null) ??
        (style.fontFamily || null);
      if (face) run.family = face.replace(/^['"]|['"]$/g, '');
    }
    if (run.size === null) {
      const size = Number(
        el.dataset.size ?? (style.fontSize.endsWith('pt') ? parseFloat(style.fontSize) : NaN),
      );
      if (Number.isFinite(size) && size > 0) run.size = size;
    }
  }
  return run;
}

function collectRuns(root: Node): Run[] {
  const runs: Run[] = [];
  let first = true;
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push({ ...formatAt(node, root), text });
      first = false;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      runs.push({ ...formatAt(el, root), newline: true });
      return;
    }
    if (el.dataset.sym !== undefined) {
      runs.push({ ...formatAt(el, root), sym: el.dataset.sym });
      first = false;
      return;
    }
    // A block (Enter in the editor makes a div) starts a new line, except the first.
    if (BLOCKS.has(el.tagName) && !first && runs.length && !runs[runs.length - 1].newline) {
      runs.push({ ...formatAt(el, root), newline: true });
    }
    el.childNodes.forEach(visit);
    if (BLOCKS.has(el.tagName)) first = false;
  };
  root.childNodes.forEach(visit);
  // The editor keeps a trailing break so the caret can sit on an empty last line.
  while (runs.length && runs[runs.length - 1].newline) runs.pop();
  return runs;
}

/**
 * The editor's content to markup. Font switches are written where the font changes, and back to the element's own
 * font (`base`) where a span ends; style tags open and close around each run.
 */
export function htmlToMarkup(root: Node, base: BaseFont): string {
  let family = base.family;
  let size = base.size;
  let out = '';
  for (const run of collectRuns(root)) {
    if (run.newline) {
      out += '\n';
      continue;
    }
    const runFamily = run.family ?? base.family;
    const runSize = run.size ?? base.size;
    if (runSize !== size) out += `<font size="${runSize}"/>`;
    if (runFamily !== family) out += `<font face="${escapeHtml(runFamily)}"/>`;
    family = runFamily;
    size = runSize;
    const tags = [
      run.bold && 'b',
      run.italic && 'i',
      run.underline && 'u',
      run.strike && 's',
      run.valign,
    ].filter((t): t is string => Boolean(t));
    const body =
      run.sym !== undefined ? `<sym>${escapeXml(run.sym)}</sym>` : escapeXml(run.text ?? '');
    out +=
      tags.map((t) => `<${t}>`).join('') +
      body +
      [...tags]
        .reverse()
        .map((t) => `</${t}>`)
        .join('');
  }
  // Adjacent runs of the same style: "<b>a</b><b>b</b>" reads as "<b>ab</b>". Removing one pair can bring the next
  // together ("</i></b><b><i>"), so repeat until nothing changes.
  for (
    let merged = out.replace(/<\/(b|i|u|s|sub|sup)><\1>/g, '');
    merged !== out;
    merged = out.replace(/<\/(b|i|u|s|sub|sup)><\1>/g, '')
  ) {
    out = merged;
  }
  return out;
}

/** The editor's content as plain text (chord symbols and figured bass, which take no formatting). */
export function htmlToPlain(root: Node): string {
  return collectRuns(root)
    .map((run) => (run.newline ? '\n' : (run.text ?? run.sym ?? '')))
    .join('');
}
