import { needsSelection, withCheck } from '../../lib/commands/selectionGates';
import { defineCommand, defineFamily, type AnyCommand } from '../../lib/commands/types';
import type { EditorCommandProps } from './editorProps';

/**
 * MuseScore's ornaments palette (roadmap E10). The engine makes each one an Ornament, which carries the 4.1+
 * ornament properties the Properties panel edits (interval above/below, accidental and cue-note display).
 */
export const ORNAMENTS = [
  { label: 'Turn', symbol: 'ornamentTurn' },
  { label: 'Inverted turn', symbol: 'ornamentTurnInverted' },
  { label: 'Turn with slash', symbol: 'ornamentTurnSlash' },
  { label: 'Trill', symbol: 'ornamentTrill' },
  { label: 'Short trill', symbol: 'ornamentShortTrill' },
  { label: 'Mordent', symbol: 'ornamentMordent' },
  { label: 'Tremblement', symbol: 'ornamentTremblement' },
  { label: 'Prall mordent', symbol: 'ornamentPrallMordent' },
  { label: 'Up prall', symbol: 'ornamentUpPrall' },
  { label: 'Haydn', symbol: 'ornamentHaydn' },
] as const;

/**
 * Notation marks added since the ribbon (roadmap E10 ornaments, E12 l.v. ties, E14 enclosures). Registered beside
 * `buildEditorCommands` (useEditorCommands, commandCatalog).
 */
export function buildNotationMarkCommands(getProps: () => EditorCommandProps): AnyCommand[] {
  return [
    defineFamily<0 | 1 | 2>({
      id: 'format.enclose',
      label: 'Enclose',
      variants: [
        { arg: 1, label: 'Parentheses' },
        { arg: 0, label: 'Brackets' },
        { arg: 2, label: 'Braces' },
      ],
      enabled: withCheck(needsSelection, () => Boolean(getProps().onAddBrackets)),
      run: async (_ctx, kind) => {
        await getProps().onAddBrackets?.(kind);
      },
    }),
    defineCommand({
      id: 'add.line.laissezVib',
      label: 'Laissez Vibrer',
      keywords: ['l.v.', 'let ring', 'tie'],
      enabled: withCheck(needsSelection, () => Boolean(getProps().onToggleLaissezVib)),
      run: async () => {
        await getProps().onToggleLaissezVib?.();
      },
    }),
    defineFamily<string>({
      id: 'add.mark.ornament',
      label: 'Ornament',
      // New since the ribbon, so no legacy test ids (`testId` preserves those only).
      variants: ORNAMENTS.map(({ label, symbol }) => ({ arg: symbol, label })),
      enabled: withCheck(needsSelection, () => Boolean(getProps().onAddArticulation)),
      run: (_ctx, symbol) => getProps().onAddArticulation?.(symbol),
    }),
  ];
}
