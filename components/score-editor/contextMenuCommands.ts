import {
  READ_ONLY_REASON,
  needsRange,
  needsSelectionOutsideInput,
  withCheck,
} from '../../lib/commands/selectionGates';
import { defineCommand, type AnyCommand, type CommandContext, type Enabled } from '../../lib/commands/types';
import type { EditorCommandProps } from './editorProps';

/**
 * The commands the score's context menu brings that the editor runs
 * (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md). Registered beside
 * `buildEditorCommands` (useEditorCommands, commandCatalog); the clipboard ones are the shell's,
 * beside Copy and Paste.
 */
type SimilarAt = { page: number; x: number; y: number } | undefined;

/** One selected element: the pattern Similar and Similar on this staff look for (MuseScore's `isSingleSelection`). */
const singleElement = (present: () => boolean): Enabled =>
  Object.assign((ctx: CommandContext) => ctx.isMutable && ctx.selection === 'single' && present(), {
    unmet: (ctx: CommandContext) =>
      !ctx.isMutable
        ? READ_ONLY_REASON
        : ctx.selection !== 'single'
          ? 'Select one element first'
          : present()
            ? undefined
            : 'Not available for this score',
  });

export function buildContextMenuCommands(getProps: () => EditorCommandProps): AnyCommand[] {
  const has = (key: keyof EditorCommandProps) => () => Boolean(getProps()[key]);
  return [
    ...(
      [
        ['edit.select.similar', 'Select Similar', 'all'],
        ['edit.select.similarStaff', 'Select Similar on This Staff', 'staff'],
      ] as const
    ).map(([id, label, scope]) =>
      defineCommand<SimilarAt>({
        id,
        label,
        keywords: ['select all', 'same kind', 'similar elements'],
        enabled: singleElement(has('onSelectSimilar')),
        run: async (_ctx, at) => {
          await getProps().onSelectSimilar?.(scope, at);
        },
      }),
    ),
    defineCommand<SimilarAt>({
      id: 'edit.select.similarRange',
      label: 'Select Similar in This Range',
      keywords: ['select all', 'same kind', 'similar elements'],
      enabled: withCheck(needsRange, has('onSelectSimilar')),
      run: async (_ctx, at) => {
        await getProps().onSelectSimilar?.('range', at);
      },
    }),
    defineCommand<{ clientX: number; clientY: number } | undefined>({
      id: 'edit.element',
      label: 'Edit Element',
      keywords: ['edit text', 'handles', 'grips'],
      enabled: withCheck(needsSelectionOutsideInput, has('onEditElement')),
      run: async (_ctx, at) => {
        await getProps().onEditElement?.(at);
      },
    }),
    // A range only: MuseScore shares Alt+Up/Down with moving through a chord's notes, which
    // applies when a note is selected.
    ...(
      [
        ['Prev', 'previous', 'Move Measure to Previous System'],
        ['Next', 'next', 'Move Measure to Next System'],
      ] as const
    ).map(([suffix, direction, label]) =>
      defineCommand({
        id: `format.measure.to${suffix}System`,
        label,
        keywords: ['system break', 'layout', 'bars'],
        enabled: withCheck(needsRange, has('onMoveMeasureToSystem')),
        run: async () => {
          await getProps().onMoveMeasureToSystem?.(direction);
        },
      }),
    ),
    defineCommand({
      id: 'format.system.fromSelection',
      label: 'Create System from Selection',
      keywords: ['system lock', 'keep on one system', 'layout'],
      enabled: withCheck(needsRange, has('onCreateSystemFromSelection')),
      run: async () => {
        await getProps().onCreateSystemFromSelection?.();
      },
    }),
    defineCommand({
      id: 'shell.contextMenu',
      label: 'Context Menu',
      keywords: ['right click', 'menu'],
      enabled: (ctx) => ctx.hasScore && has('onOpenContextMenu')(),
      run: async () => {
        await getProps().onOpenContextMenu?.();
      },
    }),
  ];
}
