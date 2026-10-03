export const extractMeasureSignaturesFromXml = (xml: string) => {
  if (typeof DOMParser === 'undefined') {
    return [];
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid MusicXML');
  }

  const isMscx = doc.documentElement?.tagName === 'museScore';
  const stripElementNames = new Set([
    'print',
    'layoutbreak',
    'system-layout',
    'staff-layout',
    'page-layout',
    'appearance',
  ]);
  const shouldStripAttribute = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'width') {
      return true;
    }
    if (lower === 'id' || lower === 'xml:id') {
      return true;
    }
    if (lower === 'x' || lower === 'y') {
      return true;
    }
    if (
      lower === 'default-x' ||
      lower === 'default-y' ||
      lower === 'relative-x' ||
      lower === 'relative-y'
    ) {
      return true;
    }
    if (lower === 'placement' || lower === 'justify' || lower === 'halign' || lower === 'valign') {
      return true;
    }
    if (lower === 'print-object' || lower === 'print-dot' || lower === 'print-spacing') {
      return true;
    }
    if (lower === 'new-page' || lower === 'new-system') {
      return true;
    }
    if (lower === 'color') {
      return true;
    }
    if (lower.startsWith('font-')) {
      return true;
    }
    return false;
  };

  const scrubElement = (element: Element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (shouldStripAttribute(attr.name)) {
        element.removeAttribute(attr.name);
      }
    });
    Array.from(element.children).forEach((child) => {
      if (stripElementNames.has(child.tagName.toLowerCase())) {
        child.remove();
        return;
      }
      scrubElement(child);
    });
  };

  const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

  const canonicalizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      const text = normalizeText(node.textContent ?? '');
      return text ? `#${text}` : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const element = node as Element;
    const attributes = Array.from(element.attributes)
      .filter((attr) => !shouldStripAttribute(attr.name))
      .map((attr) => `${attr.name}=${normalizeText(attr.value)}`)
      .sort();
    const children = Array.from(element.childNodes)
      .map((child) => canonicalizeNode(child))
      .filter(Boolean);
    const attrs = attributes.length ? ` ${attributes.join('|')}` : '';
    return `<${element.tagName}${attrs}>${children.join('')}</${element.tagName}>`;
  };

  const measureSignature = (measure: Element) => {
    const clone = measure.cloneNode(true) as Element;
    clone.removeAttribute('number');
    clone.removeAttribute('width');
    Array.from(clone.getElementsByTagName('LayoutBreak')).forEach((node) => node.remove());
    scrubElement(clone);
    return canonicalizeNode(clone);
  };

  if (isMscx) {
    const score = doc.querySelector('Score');
    if (!score) {
      return [];
    }
    const staffs = Array.from(score.children).filter(
      (node) => node.tagName === 'Staff',
    ) as Element[];
    return staffs.map((staff) => {
      const measures = Array.from(staff.getElementsByTagName('Measure'));
      return measures.map((measure) => measureSignature(measure));
    });
  }

  const parts = Array.from(doc.getElementsByTagName('part'));
  return parts.map((part) => {
    const measures = Array.from(part.getElementsByTagName('measure'));
    return measures.map((measure) => measureSignature(measure));
  });
};

export const replaceMeasuresInMusicXml = (
  sourceXml: string,
  targetXml: string,
  partIndex: number,
  replacements: Array<{ sourceIndex: number; targetIndex: number }>,
) => {
  if (!sourceXml.trim() || !targetXml.trim()) {
    return { xml: '', error: 'MusicXML content is empty.' };
  }
  if (typeof DOMParser === 'undefined') {
    return { xml: '', error: 'XML parsing is unavailable in this environment.' };
  }
  const parser = new DOMParser();
  const sourceDoc = parser.parseFromString(sourceXml, 'application/xml');
  const targetDoc = parser.parseFromString(targetXml, 'application/xml');
  if (sourceDoc.querySelector('parsererror') || targetDoc.querySelector('parsererror')) {
    return { xml: '', error: 'MusicXML is not valid XML.' };
  }

  const getPartMeasures = (doc: Document) => {
    const parts = Array.from(doc.getElementsByTagName('part'));
    const part = parts[partIndex] ?? null;
    if (!part) {
      return { part: null as Element | null, measures: [] as Element[] };
    }
    const measures = Array.from(part.children).filter(
      (node) => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'measure',
    ) as Element[];
    return { part, measures };
  };

  const { measures: sourceMeasures } = getPartMeasures(sourceDoc);
  const { measures: targetMeasures } = getPartMeasures(targetDoc);
  for (const replacementPair of replacements) {
    const sourceMeasure = sourceMeasures[replacementPair.sourceIndex];
    const targetMeasure = targetMeasures[replacementPair.targetIndex];
    if (!sourceMeasure || !targetMeasure) {
      return { xml: '', error: 'Measure not found for the selected part/index.' };
    }
    const replacement = targetDoc.importNode(sourceMeasure, true) as Element;
    const targetNumber = targetMeasure.getAttribute('number');
    if (targetNumber) {
      replacement.setAttribute('number', targetNumber);
    }
    targetMeasure.parentNode?.replaceChild(replacement, targetMeasure);
  }

  const serializer = new XMLSerializer();
  return { xml: serializer.serializeToString(targetDoc), error: '' };
};
