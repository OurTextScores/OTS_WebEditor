import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from 'saxes';

export const MUSICXML_IDENTITY_VERSION = 'xmlid-v1' as const;

type CanonicalAttribute = [name: string, value: string];
type CanonicalProcessingInstruction = ['pi', target: string, body: string];
type CanonicalText = ['text', value: string];
type CanonicalElement = [
  'element',
  name: string,
  attributes: CanonicalAttribute[],
  children: CanonicalChild[],
];
type CanonicalChild = CanonicalElement | CanonicalProcessingInstruction | CanonicalText;

type ElementFrame = {
  name: string;
  attributes: CanonicalAttribute[];
  children: CanonicalChild[];
  hasStructuralChild: boolean;
  hasNonWhitespaceText: boolean;
  preserveSpace: boolean;
};

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

const expandedName = (uri: string, local: string) => `${uri.length}:${uri}${local.length}:${local}`;

const appendChild = (children: CanonicalChild[], child: CanonicalChild) => {
  if (child[0] === 'text') {
    const previous = children.at(-1);
    if (previous?.[0] === 'text') {
      previous[1] += child[1];
      return;
    }
  }
  children.push(child);
};

type ExpandedPathSegment = { local: string; uri: string };

const compareStrings = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const isVolatileEncodingDate = (path: ExpandedPathSegment[]) =>
  path.length === 4 &&
  (path[0].local === 'score-partwise' || path[0].local === 'score-timewise') &&
  path[1].local === 'identification' &&
  path[2].local === 'encoding' &&
  path[3].local === 'encoding-date' &&
  path.every((segment) => segment.uri === path[0].uri);

const canonicalAttributes = (
  tag: SaxesTagNS,
): {
  attributes: CanonicalAttribute[];
  xmlSpace: 'preserve' | 'default' | null;
} => {
  let xmlSpace: 'preserve' | 'default' | null = null;
  const attributes = Object.values(tag.attributes)
    .filter((attribute) => attribute.uri !== XMLNS_NAMESPACE)
    .map((attribute: SaxesAttributeNS): CanonicalAttribute => {
      if (attribute.uri === XML_NAMESPACE && attribute.local === 'space') {
        if (attribute.value === 'preserve' || attribute.value === 'default') {
          xmlSpace = attribute.value;
        }
      }
      return [expandedName(attribute.uri, attribute.local), attribute.value];
    })
    .sort(
      ([leftName, leftValue], [rightName, rightValue]) =>
        compareStrings(leftName, rightName) || compareStrings(leftValue, rightValue),
    );
  return { attributes, xmlSpace };
};

const closeFrame = (frame: ElementFrame): CanonicalElement => {
  const ignoreFormattingWhitespace =
    frame.hasStructuralChild && !frame.hasNonWhitespaceText && !frame.preserveSpace;
  const children = ignoreFormattingWhitespace
    ? frame.children.filter((child) => child[0] !== 'text' || child[1].trim().length > 0)
    : frame.children;
  return ['element', frame.name, frame.attributes, children];
};

export function canonicalizeMusicXmlIdentity(xml: string): string {
  if (!xml.trim()) {
    throw new Error('MusicXML identity input is empty.');
  }

  const documentChildren: CanonicalChild[] = [];
  const frames: ElementFrame[] = [];
  const elementPath: ExpandedPathSegment[] = [];
  let skipDepth = 0;
  const parser = new SaxesParser({ xmlns: true, position: true });

  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    elementPath.push({ local: tag.local, uri: tag.uri });
    if (skipDepth > 0) {
      skipDepth += 1;
      return;
    }
    if (isVolatileEncodingDate(elementPath)) {
      skipDepth = 1;
      return;
    }

    const { attributes, xmlSpace } = canonicalAttributes(tag);
    const inheritedPreserveSpace = frames.at(-1)?.preserveSpace ?? false;
    const preserveSpace =
      xmlSpace === 'preserve' ? true : xmlSpace === 'default' ? false : inheritedPreserveSpace;
    frames.push({
      name: expandedName(tag.uri, tag.local),
      attributes,
      children: [],
      hasStructuralChild: false,
      hasNonWhitespaceText: false,
      preserveSpace,
    });
  });
  parser.on('text', (value) => {
    if (skipDepth > 0 || !value) {
      return;
    }
    const frame = frames.at(-1);
    if (!frame) {
      return;
    }
    appendChild(frame.children, ['text', value]);
    if (value.trim()) {
      frame.hasNonWhitespaceText = true;
    }
  });
  parser.on('cdata', (value) => {
    if (skipDepth > 0 || !value) {
      return;
    }
    const frame = frames.at(-1);
    if (!frame) {
      return;
    }
    appendChild(frame.children, ['text', value]);
    if (value.trim()) {
      frame.hasNonWhitespaceText = true;
    }
  });
  parser.on('processinginstruction', ({ target, body }) => {
    if (skipDepth > 0) {
      return;
    }
    const instruction: CanonicalProcessingInstruction = ['pi', target, body];
    const frame = frames.at(-1);
    if (frame) {
      frame.hasStructuralChild = true;
      appendChild(frame.children, instruction);
    } else {
      appendChild(documentChildren, instruction);
    }
  });
  parser.on('closetag', () => {
    if (skipDepth > 0) {
      skipDepth -= 1;
      elementPath.pop();
      return;
    }
    const frame = frames.pop();
    elementPath.pop();
    if (!frame) {
      throw new Error('MusicXML identity parser closed an unexpected element.');
    }
    const element = closeFrame(frame);
    const parent = frames.at(-1);
    if (parent) {
      parent.hasStructuralChild = true;
      appendChild(parent.children, element);
    } else {
      appendChild(documentChildren, element);
    }
  });

  parser.write(xml).close();
  if (frames.length > 0 || skipDepth > 0) {
    throw new Error('MusicXML identity parser did not close every element.');
  }
  return JSON.stringify([MUSICXML_IDENTITY_VERSION, documentChildren]);
}

export async function computeMusicXmlIdentityHash(xml: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot compute a MusicXML identity hash.');
  }
  const canonical = canonicalizeMusicXmlIdentity(xml);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${MUSICXML_IDENTITY_VERSION}:${hex}`;
}
