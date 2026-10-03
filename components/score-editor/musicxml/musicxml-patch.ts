import { asRecord } from '../../../lib/as-record';
import { extractPatchAnnotations, type PatchAnnotation } from '../../../lib/patch-annotations';
import { type MusicXmlPatch, type MusicXmlPatchOp } from '../ai-assistant-types';

export const parseMusicXmlPatch = (
  text: string,
): {
  patch: MusicXmlPatch | null;
  annotations?: PatchAnnotation[];
  error: string;
} => {
  if (!text.trim()) {
    return { patch: null as MusicXmlPatch | null, error: 'AI response is empty.' };
  }
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(text);
  } catch {
    return { patch: null, error: 'AI response is not valid JSON.' };
  }
  const parsed = asRecord(parsedValue);
  if (!parsed || parsed.format !== 'musicxml-patch@1' || !Array.isArray(parsed.ops)) {
    return { patch: null, error: 'AI response is not a musicxml-patch@1 payload.' };
  }
  const ops: MusicXmlPatchOp[] = [];
  const allowedOps = new Set([
    'replace',
    'setText',
    'setAttr',
    'insertBefore',
    'insertAfter',
    'delete',
  ]);
  const analyzeXmlFragmentShape = (value: string) => {
    const tokenPattern =
      /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[^>]+?>|[^<]+/g;
    const tokens = value.match(tokenPattern) || [];
    let depth = 0;
    let topLevelElementCount = 0;
    let hasTopLevelText = false;
    let unbalancedTags = false;
    for (const token of tokens) {
      if (!token) {
        continue;
      }
      if (
        token.startsWith('<!--') ||
        token.startsWith('<?') ||
        (token.startsWith('<!') && !token.startsWith('<![CDATA['))
      ) {
        continue;
      }
      if (token.startsWith('<![CDATA[')) {
        if (depth === 0 && token.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) {
          hasTopLevelText = true;
        }
        continue;
      }
      if (token.startsWith('</')) {
        if (depth === 0) {
          unbalancedTags = true;
          continue;
        }
        depth -= 1;
        continue;
      }
      if (token.startsWith('<')) {
        const isSelfClosing = /\/>\s*$/.test(token);
        if (depth === 0) {
          topLevelElementCount += 1;
        }
        if (!isSelfClosing) {
          depth += 1;
        }
        continue;
      }
      if (depth === 0 && token.trim()) {
        hasTopLevelText = true;
      }
    }
    if (depth !== 0) {
      unbalancedTags = true;
    }
    return { topLevelElementCount, hasTopLevelText, unbalancedTags };
  };
  for (let i = 0; i < parsed.ops.length; i += 1) {
    const op = asRecord(parsed.ops[i]);
    if (!op) {
      return { patch: null, error: `Patch op ${i + 1} is not an object.` };
    }
    const opName = String(op.op || '');
    if (!allowedOps.has(opName)) {
      return { patch: null, error: `Patch op ${i + 1} has unsupported op "${opName}".` };
    }
    const path = typeof op.path === 'string' ? op.path.trim() : '';
    if (!path) {
      return { patch: null, error: `Patch op ${i + 1} is missing a valid path.` };
    }
    const nextOp: MusicXmlPatchOp = { op: opName as MusicXmlPatchOp['op'], path };
    if (
      opName === 'setText' ||
      opName === 'replace' ||
      opName === 'insertBefore' ||
      opName === 'insertAfter'
    ) {
      if (typeof op.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      if (opName === 'setText' && /[<>]/.test(op.value)) {
        return {
          patch: null,
          error: `Patch op ${i + 1} setText value appears to contain XML. Use replace/insert ops for element changes.`,
        };
      }
      if (opName === 'replace' || opName === 'insertBefore' || opName === 'insertAfter') {
        const shape = analyzeXmlFragmentShape(op.value);
        if (shape.unbalancedTags) {
          return {
            patch: null,
            error: `Patch op ${i + 1} ${opName} value has unbalanced XML tags.`,
          };
        }
        if (shape.hasTopLevelText) {
          return {
            patch: null,
            error: `Patch op ${i + 1} ${opName} value has top-level text; it must contain exactly one XML element.`,
          };
        }
        if (shape.topLevelElementCount !== 1) {
          return {
            patch: null,
            error: `Patch op ${i + 1} ${opName} value has ${shape.topLevelElementCount} top-level elements; expected exactly one. Use multiple ops for sibling elements.`,
          };
        }
      }
      nextOp.value = op.value;
    }
    if (opName === 'setAttr') {
      if (typeof op.name !== 'string' || !op.name.trim()) {
        return { patch: null, error: `Patch op ${i + 1} requires an attribute name.` };
      }
      if (typeof op.value !== 'string') {
        return { patch: null, error: `Patch op ${i + 1} requires a string value.` };
      }
      nextOp.name = op.name;
      nextOp.value = op.value;
    }
    ops.push(nextOp);
  }
  return {
    patch: { format: 'musicxml-patch@1', ops },
    annotations: extractPatchAnnotations(parsed),
    error: '',
  };
};

export const applyMusicXmlPatch = (baseXml: string, patch: MusicXmlPatch) => {
  if (!baseXml.trim()) {
    return { xml: '', error: 'Base MusicXML is empty.' };
  }
  if (typeof DOMParser === 'undefined') {
    return { xml: '', error: 'XML parsing is unavailable in this environment.' };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(baseXml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return { xml: '', error: 'Base MusicXML is not valid XML.' };
  }
  const resolver = doc.createNSResolver(doc.documentElement);
  const parseFragment = (value: string) => {
    const fragmentDoc = parser.parseFromString(`<wrapper>${value}</wrapper>`, 'application/xml');
    const fragmentError = fragmentDoc.querySelector('parsererror');
    if (fragmentError) {
      return { node: null as Node | null, error: 'Patch value is not valid XML.' };
    }
    const wrapper = fragmentDoc.documentElement;
    const elementChildren = Array.from(wrapper.childNodes).filter(
      (node) => node.nodeType === Node.ELEMENT_NODE,
    );
    const textChildren = Array.from(wrapper.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
    );
    if (elementChildren.length !== 1 || textChildren.length > 0) {
      return { node: null, error: 'Patch value must contain exactly one element.' };
    }
    const imported = doc.importNode(elementChildren[0], true);
    return { node: imported, error: '' };
  };
  const resolveNodes = (path: string) => {
    try {
      const result = doc.evaluate(
        path,
        doc,
        resolver,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      if (result.snapshotLength < 1) {
        return { nodes: [] as Node[], error: `XPath "${path}" matched 0 nodes.` };
      }
      const nodes: Node[] = [];
      for (let i = 0; i < result.snapshotLength; i += 1) {
        const node = result.snapshotItem(i);
        if (node) {
          nodes.push(node);
        }
      }
      return { nodes, error: '' };
    } catch {
      return { nodes: [] as Node[], error: `XPath "${path}" could not be evaluated.` };
    }
  };
  const tryEnsureSetTextTarget = (path: string) => {
    if (!path.includes('/attributes/')) {
      return { nodes: [] as Node[], created: false };
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) {
      return { nodes: [] as Node[], created: false };
    }
    for (let prefixLength = segments.length - 1; prefixLength >= 1; prefixLength -= 1) {
      const prefixPath = `/${segments.slice(0, prefixLength).join('/')}`;
      const prefixResult = resolveNodes(prefixPath);
      if (prefixResult.error || prefixResult.nodes.length !== 1) {
        continue;
      }
      const rootNode = prefixResult.nodes[0];
      if (rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_NODE) {
        continue;
      }
      const missingSegments = segments.slice(prefixLength);
      if (missingSegments.length === 0) {
        continue;
      }
      if (!missingSegments.every((segment) => /^[A-Za-z_][\w.-]*$/.test(segment))) {
        continue;
      }
      let current: Node = rootNode;
      for (const segment of missingSegments) {
        const nextNode = doc.createElement(segment);
        if (
          current.nodeType === Node.ELEMENT_NODE &&
          (current as Element).tagName === 'measure' &&
          segment === 'attributes'
        ) {
          const firstElementChild = Array.from(current.childNodes).find(
            (child) => child.nodeType === Node.ELEMENT_NODE,
          );
          if (firstElementChild) {
            current.insertBefore(nextNode, firstElementChild);
          } else {
            current.appendChild(nextNode);
          }
        } else {
          current.appendChild(nextNode);
        }
        current = nextNode;
      }
      return { nodes: [current], created: true };
    }
    return { nodes: [] as Node[], created: false };
  };
  for (let i = 0; i < patch.ops.length; i += 1) {
    const op = patch.ops[i];
    let { nodes, error } = resolveNodes(op.path);
    if ((error || nodes.length === 0) && op.op === 'setText') {
      const ensured = tryEnsureSetTextTarget(op.path);
      if (ensured.created) {
        nodes = ensured.nodes;
        error = '';
      }
    }
    if (error || nodes.length === 0) {
      return { xml: '', error: `Patch op ${i + 1} failed: ${error || 'Target not found.'}` };
    }
    if (nodes.length !== 1) {
      return {
        xml: '',
        error: `Patch op ${i + 1} failed: XPath "${op.path}" matched ${nodes.length} nodes.`,
      };
    }
    const node = nodes[0];
    if (op.op === 'setText') {
      node.textContent = op.value ?? '';
      continue;
    }
    if (op.op === 'setAttr') {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return { xml: '', error: `Patch op ${i + 1} targets a non-element node.` };
      }
      (node as Element).setAttribute(op.name ?? '', op.value ?? '');
      continue;
    }
    if (op.op === 'delete') {
      if (!node.parentNode) {
        return { xml: '', error: `Patch op ${i + 1} target has no parent.` };
      }
      node.parentNode.removeChild(node);
      continue;
    }
    const fragment = parseFragment(op.value ?? '');
    if (fragment.error || !fragment.node) {
      return {
        xml: '',
        error: `Patch op ${i + 1} failed: ${fragment.error || 'Invalid value.'}`,
      };
    }
    if (!node.parentNode) {
      return { xml: '', error: `Patch op ${i + 1} target has no parent.` };
    }
    if (op.op === 'replace') {
      node.parentNode.replaceChild(fragment.node, node);
      continue;
    }
    if (op.op === 'insertBefore') {
      node.parentNode.insertBefore(fragment.node, node);
      continue;
    }
    if (op.op === 'insertAfter') {
      node.parentNode.insertBefore(fragment.node, node.nextSibling);
      continue;
    }
  }
  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(doc), error: '' };
};
