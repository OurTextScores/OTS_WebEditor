import { SaxesParser, type SaxesTagNS } from 'saxes';

export type MusicXmlStructuralIssue = {
  code: 'note-origin-count';
  location: string;
  message: string;
};

type NoteFrame = {
  depth: number;
  location: string;
  origins: string[];
};

const attributeValue = (tag: SaxesTagNS, localName: string) =>
  Object.values(tag.attributes).find((attribute) => attribute.local === localName)?.value ?? '';

const issueKey = (issue: MusicXmlStructuralIssue) =>
  `${issue.code}:${issue.location}:${issue.message}`;

/**
 * Check a small set of MusicXML invariants that are especially important when the full
 * notation engine is unavailable. This is deliberately narrower than schema validation.
 */
export function findMusicXmlStructuralIssues(xml: string): MusicXmlStructuralIssue[] {
  const issues: MusicXmlStructuralIssue[] = [];
  const noteFrames: NoteFrame[] = [];
  const partStack: string[] = [];
  const measureStack: Array<{ number: string; nextNote: number }> = [];
  let depth = 0;
  const parser = new SaxesParser({ xmlns: true, position: true });

  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    depth += 1;
    if (tag.local === 'part') {
      partStack.push(attributeValue(tag, 'id') || `part-${partStack.length + 1}`);
    }
    if (tag.local === 'measure') {
      measureStack.push({
        number: attributeValue(tag, 'number') || `measure-${measureStack.length + 1}`,
        nextNote: 1,
      });
    }
    if (tag.local === 'note') {
      const measure = measureStack.at(-1);
      const noteNumber = measure?.nextNote ?? 1;
      if (measure) {
        measure.nextNote += 1;
      }
      noteFrames.push({
        depth,
        location: `${partStack.at(-1) || 'part'}/measure-${measure?.number || '?'}/note-${noteNumber}`,
        origins: [],
      });
      return;
    }
    const note = noteFrames.at(-1);
    if (
      note &&
      depth === note.depth + 1 &&
      (tag.local === 'pitch' || tag.local === 'unpitched' || tag.local === 'rest')
    ) {
      note.origins.push(tag.local);
    }
  });
  parser.on('closetag', (tag) => {
    if (tag.local === 'note') {
      const note = noteFrames.pop();
      if (note && note.origins.length !== 1) {
        const found = note.origins.length ? note.origins.join(', ') : 'none';
        issues.push({
          code: 'note-origin-count',
          location: note.location,
          message: `${note.location} must contain exactly one of <pitch>, <unpitched>, or <rest>; found ${found}.`,
        });
      }
    }
    if (tag.local === 'measure') {
      measureStack.pop();
    }
    if (tag.local === 'part') {
      partStack.pop();
    }
    depth -= 1;
  });

  parser.write(xml).close();
  return issues;
}

export function findIntroducedMusicXmlStructuralIssues(
  baseXml: string,
  proposedXml: string,
): MusicXmlStructuralIssue[] {
  const baseIssues = new Set(findMusicXmlStructuralIssues(baseXml).map(issueKey));
  return findMusicXmlStructuralIssues(proposedXml).filter(
    (issue) => !baseIssues.has(issueKey(issue)),
  );
}
