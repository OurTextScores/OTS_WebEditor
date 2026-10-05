import type { CommandId } from '../../lib/commands/types';

/**
 * The menu bar as data (SHELL_REDESIGN_DESIGN §8.1): trees of command ids, not callbacks
 * (§5.3). Behaviour, labels, shortcuts and enablement all come from the registry, so a
 * menu entry whose command is not registered is simply not shown.
 *
 * Every command appears in exactly one canonical location here; the palette searches the
 * same tree for each command's menu path.
 */
export type MenuNode =
  /** One command, or — with `arg` — one variant of a family. */
  | {
      readonly kind: 'item';
      readonly id: CommandId;
      readonly label?: string;
      readonly arg?: unknown;
    }
  /** Every variant of a family: a submenu, or inline items when `inline` is set. */
  | {
      readonly kind: 'family';
      readonly id: CommandId;
      readonly label?: string;
      readonly inline?: boolean;
    }
  | { readonly kind: 'submenu'; readonly label: string; readonly children: readonly MenuNode[] }
  | { readonly kind: 'separator' }
  /** The last few scores with checkpoints, from the shell store (File ▸ Open Recent). */
  | { readonly kind: 'recentScores' };

export interface MenuDefinition {
  readonly id: string;
  readonly label: string;
  readonly children: readonly MenuNode[];
}

const item = (id: CommandId, label?: string, arg?: unknown): MenuNode => ({
  kind: 'item',
  id,
  ...(label ? { label } : {}),
  ...(arg !== undefined ? { arg } : {}),
});
const family = (id: CommandId, label?: string, inline = false): MenuNode => ({
  kind: 'family',
  id,
  ...(label ? { label } : {}),
  ...(inline ? { inline } : {}),
});
const submenu = (label: string, ...children: MenuNode[]): MenuNode => ({
  kind: 'submenu',
  label,
  children,
});
const separator: MenuNode = { kind: 'separator' };

export const MENUS: readonly MenuDefinition[] = [
  {
    id: 'file',
    label: 'File',
    children: [
      item('file.new'),
      item('file.open'),
      { kind: 'recentScores' },
      item('compare.load'),
      separator,
      item('checkpoint.save'),
      separator,
      submenu(
        'Export',
        item('file.export.pdf'),
        item('file.export.png'),
        item('file.export.svg'),
        item('file.export.mscz'),
        item('file.export.mscx'),
        item('file.export.musicxml'),
        item('file.export.mxl'),
        item('file.export.abc'),
        item('file.export.midi'),
        item('file.export.audio'),
        item('file.export.pageAudio'),
      ),
      item('file.drive.upload'),
      item('file.shareLink'),
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    children: [
      item('edit.undo'),
      item('edit.redo'),
      separator,
      item('edit.copy'),
      item('edit.paste'),
      item('edit.delete'),
      separator,
      item('edit.selectAll'),
      item('edit.deselect'),
      submenu(
        'Move Selection',
        item('edit.select.nextChord'),
        item('edit.select.prevChord'),
        separator,
        item('edit.select.extendNextChord'),
        item('edit.select.extendPrevChord'),
        item('edit.select.extendNextMeasure'),
        item('edit.select.extendPrevMeasure'),
        item('edit.select.extendStaffAbove'),
        item('edit.select.extendStaffBelow'),
      ),
      family('edit.selectionFilter'),
      separator,
      submenu(
        'Pitch',
        item('edit.pitch.up'),
        item('edit.pitch.down'),
        item('edit.pitch.octaveUp'),
        item('edit.pitch.octaveDown'),
      ),
      submenu(
        'Duration',
        item('edit.duration.shorter'),
        item('edit.duration.longer'),
        item('edit.duration.dot'),
        item('edit.duration.doubleDot'),
        separator,
        family('edit.duration.set', undefined, true),
      ),
    ],
  },
  {
    id: 'view',
    label: 'View',
    children: [
      submenu(
        'Activity',
        item('shell.activity.write'),
        item('shell.activity.compare'),
        item('shell.activity.history'),
      ),
      separator,
      item('view.zoom.in'),
      item('view.zoom.out'),
      item('view.zoom.preset', 'Zoom to 100%', 1),
      submenu(
        'Zoom',
        family('view.zoom.preset', undefined, true),
        item('view.zoom.fitWidth'),
        item('view.zoom.fitHeight'),
      ),
      separator,
      item('view.panel.palettes'),
      item('view.panel.properties'),
      item('view.panel.undoHistory'),
      item('view.panel.aiTools'),
      item('view.panel.scoreSource'),
      item('view.panel.history'),
      item('view.panels.toggle'),
      submenu(
        'Toolbar',
        family('view.toolbar.section', undefined, true),
        separator,
        item('view.toolbar.showAll'),
      ),
      item('view.statusBar'),
      item('view.progressiveLoad'),
      family('view.palette.open'),
      separator,
      submenu(
        'Go to',
        item('view.goto.nextPage'),
        item('view.goto.prevPage'),
        item('view.goto.prompt'),
      ),
    ],
  },
  {
    id: 'add',
    label: 'Add',
    children: [
      submenu(
        'Notes',
        item('add.noteInput'),
        family('add.inputMethod', 'Input Method'),
        family('add.note.step', 'Note by Letter'),
        item('add.rest'),
        family('add.grace', 'Grace Notes'),
      ),
      family('add.accidental', 'Accidentals'),
      family('add.tuplet', 'Tuplets'),
      submenu('Measures', item('add.measures'), item('add.pickup')),
      submenu(
        'Signatures',
        submenu(
          'Time',
          family('add.timeSig', undefined, true),
          separator,
          item('add.timeSig.custom'),
        ),
        family('add.keySig', 'Key'),
        family('add.clef'),
      ),
      submenu(
        'Text',
        item('add.text.title'),
        item('add.text.subtitle'),
        item('add.text.composer'),
        item('add.text.lyricist'),
        separator,
        item('add.text.staff'),
        item('add.text.system'),
        item('add.text.expression'),
        item('add.text.lyrics'),
        item('add.text.tempo'),
        separator,
        family('add.text.harmony', undefined, true),
        item('add.text.figuredBass'),
        separator,
        item('add.text.fingering'),
        item('add.text.fingering.lh'),
        item('add.text.fingering.rh'),
        item('add.text.stringNumber'),
        separator,
        item('add.text.sticking'),
        item('add.text.instrumentChange'),
      ),
      submenu(
        'Lines',
        item('add.line.slur'),
        item('add.line.tie'),
        family('add.line.hairpin', 'Hairpins'),
        submenu(
          'Pedal',
          family('add.line.pedal', undefined, true),
          item('add.line.pedal.sostenuto'),
          item('add.line.pedal.unaCorda'),
          item('add.line.pedal.split'),
        ),
        family('add.line.ottava', 'Ottava'),
        family('add.line.trill', 'Trills'),
        family('add.line.glissando', 'Glissandos'),
      ),
      submenu(
        'Marks',
        family('add.mark.dynamic', 'Dynamics'),
        family('add.mark.articulation', 'Articulations'),
        family('add.mark.fermata', 'Fermatas'),
        family('add.mark.breath', 'Breaths & Caesuras'),
        family('add.mark.arpeggio', 'Arpeggios'),
        family('add.mark.tremolo', 'Tremolos'),
        family('add.mark.fretboard', 'Fretboard Diagrams'),
      ),
      submenu(
        'Repeats & Jumps',
        item('add.repeat.start'),
        item('add.repeat.end'),
        family('add.repeat.count'),
        family('add.barline', 'Barlines'),
        family('add.volta', 'Voltas'),
        family('add.marker', 'Markers'),
        family('add.jump', 'Jumps'),
      ),
      item('add.ambitus'),
      item('view.panel.instruments', 'Instruments…'),
    ],
  },
  {
    id: 'format',
    label: 'Format',
    children: [
      submenu('Breaks', item('format.break.line'), item('format.break.page')),
      family('format.beam', 'Beams'),
      item('format.flip'),
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      item('tools.transpose'),
      family('tools.voice', 'Voices'),
      item('tools.explode'),
      item('tools.implode'),
      item('tools.regroup'),
      item('tools.resequence'),
      separator,
      item('tools.relayout'),
      submenu(
        'Measures',
        item('tools.measures.removeSelected'),
        item('tools.measures.removeTrailingEmpty'),
      ),
      separator,
      submenu(
        'AI',
        item('ai.open.assistant'),
        item('ai.open.notagen'),
        item('ai.open.transcoda'),
        item('ai.open.multitrack'),
        item('ai.open.harmony'),
        item('ai.open.functional'),
        item('ai.open.mma'),
      ),
      submenu(
        'Playback',
        item('playback.soundfont'),
        separator,
        item('playback.metronome'),
        item('playback.countIn'),
      ),
    ],
  },
  {
    id: 'help',
    label: 'Help',
    children: [item('help.open'), item('help.shortcuts'), item('shell.palette')],
  },
];

/** Ids the menus mention, for tests and for the palette to know what is menu-reachable. */
export function menuCommandIds(menus: readonly MenuDefinition[] = MENUS): Set<CommandId> {
  const ids = new Set<CommandId>();
  const visit = (nodes: readonly MenuNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'item' || node.kind === 'family') ids.add(node.id);
      else if (node.kind === 'submenu') visit(node.children);
    }
  };
  for (const menu of menus) visit(menu.children);
  return ids;
}

/**
 * Where each command (and each variant of a family) lives, as "Add ▸ Marks ▸ Dynamics",
 * for the palette's search and for showing a user where a command is. The key is the
 * command id, or `id` + `\0` + the JSON of the variant argument for a family variant.
 */
export function buildMenuPathIndex(
  menus: readonly MenuDefinition[] = MENUS,
  familyLabel: (id: CommandId) => string | undefined = () => undefined,
): Map<string, string> {
  const paths = new Map<string, string>();
  const visit = (nodes: readonly MenuNode[], trail: readonly string[]) => {
    for (const node of nodes) {
      if (node.kind === 'submenu') visit(node.children, [...trail, node.label]);
      else if (node.kind === 'item') {
        const key = node.arg === undefined ? node.id : variantPathKey(node.id, node.arg);
        if (!paths.has(key)) paths.set(key, trail.join(' ▸ '));
      } else if (node.kind === 'family') {
        const label = node.label ?? familyLabel(node.id);
        const inline = node.inline || !label;
        paths.set(`${node.id}\0*`, (inline ? trail : [...trail, label!]).join(' ▸ '));
      }
    }
  };
  for (const menu of menus) visit(menu.children, [menu.label]);
  return paths;
}

export const variantPathKey = (id: CommandId, arg: unknown): string =>
  `${id}\0${JSON.stringify(arg)}`;
