import {
  READ_ONLY_REASON,
  mutable,
  needsBarTarget,
  needsRange,
  needsSelection,
  needsSelectionOutsideInput,
  withCheck,
} from '../../lib/commands/selectionGates';
import {
  defineCommand,
  defineFamily,
  type AnyCommand,
  type CommandContext,
  type Enabled,
} from '../../lib/commands/types';
import { FRAME_TEXT_KINDS, type FrameTextKind } from './commands/context-menu-edits';
import { pickFile } from './file-picker';
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
    // A frame's Add ▸ menu. The engine takes the selected frame; title and the other header texts
    // need a vertical one, which the menu offers them on.
    defineFamily<FrameTextKind>({
      id: 'add.frameText',
      label: 'Frame Text',
      variants: FRAME_TEXT_KINDS.map(({ kind, label }) => ({ arg: kind, label })),
      enabled: singleElement(has('onAddFrameText')),
      run: async (_ctx, kind) => {
        await getProps().onAddFrameText?.(kind);
      },
    }),
    defineCommand({
      id: 'add.fretboardForHarmony',
      label: 'Fretboard Diagram from Chord Symbol',
      keywords: ['chord diagram', 'guitar', 'harmony'],
      enabled: withCheck(needsSelection, has('onAddFretboardForHarmony')),
      run: async () => {
        await getProps().onAddFretboardForHarmony?.();
      },
    }),
    ...(
      [
        ['format.snap.previous', 'Snap to Previous', 0],
        ['format.snap.next', 'Snap to Next', 1],
      ] as const
    ).map(([id, label, which]) =>
      defineCommand({
        id,
        label,
        keywords: ['hairpin', 'tempo change', 'attach'],
        enabled: withCheck(needsSelection, has('onToggleSnap')),
        run: async () => {
          await getProps().onToggleSnap?.(which);
        },
      }),
    ),
    // The settings dialogs (docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md, Phase 4).
    ...(
      [
        ['format.style', 'Style', 'style', ['engraving', 'spacing', 'font', 'music font']],
        ['format.pageSettings', 'Page Settings', 'pageSettings', ['page size', 'margins', 'staff space']],
      ] as const
    ).map(([id, label, kind, keywords]) =>
      defineCommand({
        id,
        label,
        opensDialog: true,
        keywords,
        enabled: withCheck(mutable, has('onOpenScoreDialog')),
        run: () => getProps().onOpenScoreDialog?.(kind),
      }),
    ),
    defineCommand<File | undefined>({
      id: 'format.loadStyle',
      label: 'Load Style',
      opensDialog: true,
      keywords: ['mss', 'style file'],
      enabled: withCheck(mutable, has('onLoadStyle')),
      run: async (_ctx, file) => {
        const chosen = file ?? (await pickFile('.mss'));
        if (chosen) await getProps().onLoadStyle?.(chosen);
      },
    }),
    defineCommand({
      id: 'format.timeSigProperties',
      label: 'Time Signature Properties',
      opensDialog: true,
      keywords: ['beam groups', 'beaming', 'common time', 'cut time', 'courtesy'],
      enabled: withCheck(needsSelection, has('onOpenScoreDialog')),
      run: () => getProps().onOpenScoreDialog?.('timeSigProperties'),
    }),
    defineCommand({
      id: 'measure.properties',
      label: 'Measure Properties',
      opensDialog: true,
      keywords: ['bar properties', 'irregular', 'actual duration', 'pickup'],
      enabled: withCheck(needsBarTarget, has('onOpenScoreDialog')),
      run: () => getProps().onOpenScoreDialog?.('measureProperties'),
    }),
    defineCommand<{ at?: { page: number; x: number; y: number }; note?: boolean } | undefined>({
      id: 'edit.select.more',
      label: 'Select More',
      opensDialog: true,
      keywords: ['select similar', 'filter', 'same pitch'],
      // Patterned on the right-clicked element, else the single selection (the engine refuses neither).
      enabled: withCheck(needsSelection, has('onOpenScoreDialog')),
      run: (_ctx, context) => getProps().onOpenScoreDialog?.('selectMore', context ?? {}),
    }),
    defineCommand<{ staffIdx?: number | null } | undefined>({
      id: 'instruments.staffProperties',
      label: 'Staff/Part Properties',
      opensDialog: true,
      keywords: ['staff', 'part', 'instrument name', 'small staff', 'lines'],
      enabled: withCheck(mutable, has('onOpenScoreDialog')),
      run: (_ctx, arg) =>
        getProps().onOpenScoreDialog?.('staffProperties', arg?.staffIdx == null ? {} : { staffIdx: arg.staffIdx }),
    }),
    defineCommand({
      id: 'instruments.changeAt',
      label: 'Select Instrument',
      opensDialog: true,
      keywords: ['instrument change', 'change instrument'],
      enabled: singleElement(has('onOpenScoreDialog')),
      run: () => getProps().onOpenScoreDialog?.('changeInstrument'),
    }),
    defineCommand<File | undefined>({
      id: 'add.image',
      label: 'Image',
      opensDialog: true,
      keywords: ['picture', 'logo', 'frame'],
      enabled: singleElement(has('onAddImageToFrame')),
      run: async (_ctx, file) => {
        const chosen = file ?? (await pickFile('.png,.jpg,.jpeg,.svg,.bmp,.tif,.tiff'));
        if (chosen) await getProps().onAddImageToFrame?.(chosen);
      },
    }),
    defineCommand({
      id: 'tools.realizeHarmony',
      label: 'Realize Chord Symbols',
      opensDialog: true,
      keywords: ['chord symbols to notes', 'harmony'],
      enabled: withCheck(needsSelection, has('onOpenScoreDialog')),
      run: () => getProps().onOpenScoreDialog?.('realizeHarmony'),
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
