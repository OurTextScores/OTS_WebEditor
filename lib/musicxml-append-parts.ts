export type AppendMusicXmlPartsResult = {
  xml: string;
  appendedPartCount: number;
  partIdMap: Record<string, string>;
  warnings: string[];
};

const isElement = (node: Node | null): node is Element => Boolean(node && node.nodeType === Node.ELEMENT_NODE);

const firstChildElementByName = (parent: Element, localName: string): Element | null => {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) {
      return child;
    }
  }
  return null;
};

const directChildrenByName = (parent: Element, localName: string) => {
  return Array.from(parent.children).filter((child) => child.localName === localName);
};

const parseMusicXml = (xml: string, label: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new Error(`${label} MusicXML is not well-formed.`);
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'score-partwise') {
    throw new Error(`${label} MusicXML must have a <score-partwise> root.`);
  }
  return { doc, root };
};

const collectUsedIds = (root: Element) => {
  const ids = new Set<string>();
  for (const node of Array.from(root.getElementsByTagName('*'))) {
    const value = node.getAttribute('id');
    if (value) {
      ids.add(value);
    }
  }
  return ids;
};

const collectUsedPartIds = (root: Element) => {
  const ids = new Set<string>();
  for (const child of Array.from(root.children)) {
    if ((child.localName === 'part' || child.localName === 'score-part') && child.getAttribute('id')) {
      ids.add(child.getAttribute('id') || '');
    }
  }
  const partList = firstChildElementByName(root, 'part-list');
  if (partList) {
    for (const scorePart of directChildrenByName(partList, 'score-part')) {
      const id = scorePart.getAttribute('id');
      if (id) {
        ids.add(id);
      }
    }
  }
  return ids;
};

const maxPartNumber = (usedPartIds: Set<string>) => {
  let max = 0;
  for (const id of usedPartIds) {
    const match = /^P(\d+)$/.exec(id);
    if (!match) {
      continue;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
};

const ensurePartList = (doc: Document, root: Element) => {
  const existing = firstChildElementByName(root, 'part-list');
  if (existing) {
    return { partList: existing, created: false };
  }
  const partList = doc.createElement('part-list');
  const firstPart = directChildrenByName(root, 'part')[0] || null;
  if (firstPart && firstPart.parentNode) {
    firstPart.parentNode.insertBefore(partList, firstPart);
  } else {
    root.appendChild(partList);
  }
  return { partList, created: true };
};

const remapIdWithPrefix = (value: string, oldPartId: string, newPartId: string) => {
  if (value === oldPartId) {
    return newPartId;
  }
  const prefix = `${oldPartId}-`;
  if (value.startsWith(prefix)) {
    return `${newPartId}-${value.slice(prefix.length)}`;
  }
  return value;
};

const ensureUniqueId = (candidate: string, usedIds: Set<string>) => {
  if (!usedIds.has(candidate)) {
    return candidate;
  }
  let suffix = 2;
  while (usedIds.has(`${candidate}_${suffix}`)) {
    suffix += 1;
  }
  return `${candidate}_${suffix}`;
};

const remapScorePartIds = (scorePart: Element, oldPartId: string, newPartId: string, usedIds: Set<string>) => {
  const idMap = new Map<string, string>();
  const withIds = [scorePart, ...Array.from(scorePart.getElementsByTagName('*'))];
  for (const node of withIds) {
    const id = node.getAttribute('id');
    if (!id) {
      continue;
    }
    const existing = idMap.get(id);
    if (existing) {
      node.setAttribute('id', existing);
      continue;
    }
    const remapped = remapIdWithPrefix(id, oldPartId, newPartId);
    const unique = ensureUniqueId(remapped, usedIds);
    idMap.set(id, unique);
    node.setAttribute('id', unique);
    usedIds.add(unique);
  }
  return idMap;
};

const remapPartNodeRefs = (part: Element, oldPartId: string, newPartId: string, idMap: Map<string, string>) => {
  part.setAttribute('id', newPartId);
  const nodes = [part, ...Array.from(part.getElementsByTagName('*'))];
  for (const node of nodes) {
    if (!isElement(node)) {
      continue;
    }
    for (const attr of Array.from(node.attributes)) {
      const mapped = idMap.get(attr.value);
      if (mapped) {
        node.setAttribute(attr.name, mapped);
        continue;
      }
      const prefixed = remapIdWithPrefix(attr.value, oldPartId, newPartId);
      if (prefixed !== attr.value) {
        node.setAttribute(attr.name, prefixed);
      }
    }
  }
};

const partNameFromPart = (part: Element, fallback: string) => {
  const name = part.querySelector('measure part-name-display display-text');
  if (name?.textContent?.trim()) {
    return name.textContent.trim();
  }
  return fallback;
};

export const appendMusicXmlParts = (baseXml: string, sourceXml: string): AppendMusicXmlPartsResult => {
  const { doc: baseDoc, root: baseRoot } = parseMusicXml(baseXml, 'Target');
  const { root: sourceRoot } = parseMusicXml(sourceXml, 'Generated');

  const warnings: string[] = [];
  const sourceParts = directChildrenByName(sourceRoot, 'part');
  if (!sourceParts.length) {
    throw new Error('Generated MusicXML does not contain any <part> elements to append.');
  }

  const sourcePartList = firstChildElementByName(sourceRoot, 'part-list');
  if (!sourcePartList) {
    throw new Error('Generated MusicXML does not contain a <part-list>.');
  }

  const { partList: targetPartList, created: createdPartList } = ensurePartList(baseDoc, baseRoot);
  if (createdPartList) {
    warnings.push('Target score had no <part-list>; created one before appending parts.');
  }

  const sourceScorePartsById = new Map<string, Element>();
  for (const scorePart of directChildrenByName(sourcePartList, 'score-part')) {
    const id = scorePart.getAttribute('id');
    if (!id) {
      continue;
    }
    sourceScorePartsById.set(id, scorePart);
  }

  const usedPartIds = collectUsedPartIds(baseRoot);
  const usedIds = collectUsedIds(baseRoot);
  let nextPartNumber = maxPartNumber(usedPartIds) + 1;
  const partIdMap = new Map<string, string>();
  const appendedPartIds: string[] = [];

  for (const sourcePart of sourceParts) {
    const oldPartId = sourcePart.getAttribute('id');
    if (!oldPartId) {
      continue;
    }
    if (!partIdMap.has(oldPartId)) {
      let candidate = `P${nextPartNumber}`;
      while (usedPartIds.has(candidate)) {
        nextPartNumber += 1;
        candidate = `P${nextPartNumber}`;
      }
      nextPartNumber += 1;
      usedPartIds.add(candidate);
      partIdMap.set(oldPartId, candidate);
      appendedPartIds.push(candidate);
    }
  }

  for (const sourcePart of sourceParts) {
    const oldPartId = sourcePart.getAttribute('id');
    if (!oldPartId) {
      continue;
    }
    const newPartId = partIdMap.get(oldPartId);
    if (!newPartId) {
      continue;
    }

    const sourceScorePart = sourceScorePartsById.get(oldPartId);
    let scorePartNode: Element;
    if (sourceScorePart) {
      scorePartNode = baseDoc.importNode(sourceScorePart, true) as Element;
    } else {
      scorePartNode = baseDoc.createElement('score-part');
      scorePartNode.setAttribute('id', oldPartId);
      const partName = baseDoc.createElement('part-name');
      partName.textContent = partNameFromPart(sourcePart, `Imported Part ${newPartId}`);
      scorePartNode.appendChild(partName);
      warnings.push(`Generated part ${oldPartId} had no matching <score-part>; created a minimal descriptor.`);
    }

    const idMap = remapScorePartIds(scorePartNode, oldPartId, newPartId, usedIds);
    targetPartList.appendChild(scorePartNode);

    const partNode = baseDoc.importNode(sourcePart, true) as Element;
    remapPartNodeRefs(partNode, oldPartId, newPartId, idMap);
    baseRoot.appendChild(partNode);
  }

  const serializer = new XMLSerializer();
  const partIdRecord: Record<string, string> = {};
  for (const [oldId, newId] of partIdMap.entries()) {
    partIdRecord[oldId] = newId;
  }

  return {
    xml: serializer.serializeToString(baseDoc),
    appendedPartCount: appendedPartIds.length,
    partIdMap: partIdRecord,
    warnings,
  };
};
