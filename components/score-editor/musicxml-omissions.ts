import type { Score } from '../../lib/webmscore-loader';

/**
 * What the score has that its MusicXML leaves out (roadmap E23). OTS's AI tools see the score as MusicXML, and an
 * applied edit reloads it from MusicXML. Style settings are carried across the reload (style-carry.ts); these are not,
 * and are reset by an applied edit (scripts/musicxml-preservation-probe.mjs measures it). The AI is told, so it does not
 * contradict or "fix" them, and so is the user, when an applied edit resets them.
 */
export type Omission = {
  kind: 'systemLock' | 'swing' | 'harpPedalText' | 'accidentalBraces';
  count: number;
};

const LABELS: Record<Omission['kind'], (count: number) => string> = {
  systemLock: (n) => `${n} system lock${n === 1 ? '' : 's'} (measures kept together on a system)`,
  swing: (n) => `${n} swing setting${n === 1 ? '' : 's'} with a ratio (MusicXML has only the word)`,
  harpPedalText: (n) => `${n} harp pedal marking${n === 1 ? '' : 's'} written as text`,
  accidentalBraces: (n) => `${n} accidental${n === 1 ? '' : 's'} in braces`,
};

const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

/** The omissions in a score's MSCX. */
export function findMusicXmlOmissions(mscx: string): Omission[] {
  const found: Omission[] = [
    { kind: 'systemLock', count: count(mscx, /<systemLock>/g) },
    { kind: 'swing', count: count(mscx, /<swing unit="[^"]+" ratio="\d+"\/>/g) },
    {
      kind: 'harpPedalText',
      count: count(mscx, /<HarpPedalDiagram>\s*<isDiagram>0<\/isDiagram>/g),
    },
    // AccidentalBracket 3 is a brace (1 parenthesis and 2 bracket are in MusicXML).
    {
      kind: 'accidentalBraces',
      count: count(mscx, /<Accidental>(?:(?!<\/Accidental>)[\s\S])*?<bracket>3<\/bracket>/g),
    },
  ];
  return found.filter((omission) => omission.count > 0);
}

/** The prompt section for the AI: Style always, then what an applied edit would reset. */
export function omissionsPromptSection(omissions: Omission[]): string {
  const lines = [
    "The score's Style settings (page layout, spacing, measure numbering, fonts) are not in the MusicXML. They are kept when an edit is applied: do not try to set them in the MusicXML.",
  ];
  if (omissions.length) {
    lines.push(
      'The score also has these, which the MusicXML does not show and an applied edit resets. Mention it if your change would affect them:',
      ...omissions.map((omission) => `- ${LABELS[omission.kind](omission.count)}`),
    );
  }
  return lines.join('\n');
}

/** The notice after an applied edit reset them, or null when there was nothing to reset. */
export function omissionsLossNotice(omissions: Omission[]): string | null {
  if (!omissions.length) return null;
  return `MusicXML cannot hold these, so the applied edit reset them: ${omissions
    .map((omission) => LABELS[omission.kind](omission.count))
    .join('; ')}. Restore the checkpoint taken before the edit to get them back.`;
}

/** The omissions in the live score, read from its MSCX through the serialized engine queue. */
export async function readMusicXmlOmissions(
  score: Score | null | undefined,
  run: <T>(operation: () => Promise<T>, label: string) => Promise<T> = (operation) => operation(),
): Promise<Omission[]> {
  if (!score?.saveMsc) return [];
  try {
    const data = await run(() => Promise.resolve(score.saveMsc!('mscx')), 'saveMsc(omissions)');
    return findMusicXmlOmissions(typeof data === 'string' ? data : new TextDecoder().decode(data));
  } catch (error) {
    console.warn('Could not read what the MusicXML omits', error);
    return [];
  }
}
