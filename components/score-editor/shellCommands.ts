import { defineCommand, type AnyCommand, type CommandContext } from '../../lib/commands/types';
import type { ScoreSummary } from '../../lib/checkpoints';
import { decodeScoreXml, type Score } from '../../lib/webmscore-loader';
import { notify } from '../shell/notices';
import type { WorkspaceDock } from '../shell/useWorkspaceDock';
import type { OtsActivity } from '../shell/workspaceMode';
import { runCommand } from '../../lib/commands/registry';
import type { AiToolsTab } from './ai-tools/AiToolsTabStrip';

/**
 * What the shell's commands need from `ScoreEditor`: the panel and page state it owns and
 * the handlers behind Save Checkpoint, Copy and Paste. Passed as one object so the editor
 * hands over a single value, and read through a getter so commands always see the latest.
 */
export interface ShellEditorBindings {
  readonly score: Score | null;
  readonly aiEnabled: boolean;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly goToPage: (page: number) => Promise<void>;
  readonly goToNextPage: () => void;
  readonly goToPreviousPage: () => void;
  /** The v2 shell's left dock; null under `?shell=legacy`, where the old sidebars are in charge. */
  readonly dock: WorkspaceDock | null;
  /** The user-selected activity, and whether a compare session is open (it takes over). */
  readonly activity: OtsActivity;
  readonly setActivity: (activity: OtsActivity) => void;
  readonly compareOpen: boolean;
  readonly closeCompare: () => void;
  readonly inspectorOpen: boolean;
  readonly setInspectorOpen: (open: boolean) => void;
  readonly musicXmlOpen: boolean;
  readonly setMusicXmlOpen: (open: boolean) => void;
  readonly aiToolsOpen: boolean;
  readonly setAiToolsOpen: (open: boolean) => void;
  readonly setAiTool: (tool: AiToolsTab) => void;
  /** Panels can all be hidden at once; opening one has to bring them back. */
  readonly setPanelsVisible: (visible: boolean) => void;
  /** Left sidebar (History): the checkpoint list the status bar's checkpoint dot opens. */
  readonly setCheckpointsCollapsed: (collapsed: boolean) => void;
  readonly setLeftSidebarTab: (tab: 'checkpoints') => void;
  /** View state the status bar and header transport show; see `ShellView`. */
  readonly zoom: number;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly interactionPreparing: boolean;
  readonly dirty: boolean;
  readonly checkpointCount: number;
  readonly pageCountIsFloor: boolean;
  readonly progressiveLoadEnabled: boolean;
  readonly toggleProgressiveLoad: () => void;
  readonly saveCheckpoint: () => Promise<void> | void;
  readonly copySelection: () => Promise<unknown> | unknown;
  readonly pasteSelection: () => Promise<unknown> | unknown;
  readonly scoreSummaries: readonly ScoreSummary[];
  readonly openScoreFromSummary: (summary: ScoreSummary) => void;
}

type GetBindings = () => ShellEditorBindings;

export const AI_TOOLS: readonly {
  tool: AiToolsTab;
  id: string;
  label: string;
  /** The legacy tab button's test id; the v2 tool picker's options keep it. */
  testId: string;
  /** Needs the AI proxy; the other tools run without it. */
  needsAi: boolean;
}[] = [
  { tool: 'assistant', id: 'assistant', label: 'AI Assistant', testId: 'tab-ai', needsAi: true },
  { tool: 'notagen', id: 'notagen', label: 'NotaGen', testId: 'tab-notagen', needsAi: true },
  {
    tool: 'transcoda',
    id: 'transcoda',
    label: 'Transcoda OMR',
    testId: 'tab-transcoda',
    needsAi: false,
  },
  {
    tool: 'multitrack',
    id: 'multitrack',
    label: 'Multitrack',
    testId: 'tab-multitrack-vae',
    needsAi: false,
  },
  { tool: 'harmony', id: 'harmony', label: 'Harmony', testId: 'tab-harmony', needsAi: false },
  {
    tool: 'functional',
    id: 'functional',
    label: 'Functional Harmony',
    testId: 'tab-functional-harmony',
    needsAi: false,
  },
  { tool: 'mma', id: 'mma', label: 'Accompaniment (MMA)', testId: 'tab-mma', needsAi: false },
];

/**
 * Where a bar is, from the engine's per-measure layout boxes (one per measure, in score
 * order, each carrying its page). Null when the bar does not exist. A bar is its position,
 * not its printed number, so a score with a pickup or restarted numbering counts from 1.
 */
export async function pageOfBar(score: Score, bar: number): Promise<number | null> {
  const positions = await score.measurePositions();
  const measure = positions?.elements?.[bar - 1];
  return measure && Number.isFinite(measure.page) ? measure.page : null;
}

/**
 * The first measure carrying rehearsal mark `mark` (case-insensitive), as a zero-based
 * measure index, read from the score's MusicXML. Null when no measure has it.
 */
export function measureOfRehearsalMark(xml: string, mark: string): number | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const wanted = mark.trim().toLowerCase();
  const measures = doc.getElementsByTagName('part')[0]?.getElementsByTagName('measure');
  if (!measures) return null;
  for (let index = 0; index < measures.length; index += 1) {
    const marks = measures[index].getElementsByTagName('rehearsal');
    for (let at = 0; at < marks.length; at += 1) {
      if ((marks[at].textContent ?? '').trim().toLowerCase() === wanted) return index;
    }
  }
  return null;
}

/**
 * The commands that need `ScoreEditor`'s state (SHELL_REDESIGN_DESIGN Phase 1): panels,
 * paging, checkpoints, copy/paste, recent scores and navigation. The ribbon's own actions
 * live in `editorCommands.ts`; the shell's (palette, shortcuts list) in `ShellHeader`.
 */
export function buildShellEditorCommands(getBindings: GetBindings): AnyCommand[] {
  const b = getBindings;

  const hasScore: (ctx: CommandContext) => boolean = (ctx) => ctx.hasScore;

  const togglePanel = (
    id: string,
    label: string,
    shortcut: string | undefined,
    isOpen: () => boolean,
    set: (open: boolean) => void,
  ) =>
    defineCommand({
      id,
      label,
      shortcut,
      keywords: ['panel', 'toggle', 'show', 'hide'],
      checked: () => isOpen(),
      run: () => {
        // Opening a panel while all panels are hidden has to bring them back.
        if (!isOpen()) b().setPanelsVisible(true);
        set(!isOpen());
      },
    });

  const navigate = async (page: number | null, description: string) => {
    if (page === null) {
      notify({ kind: 'warning', title: `Could not find ${description}.` });
      return;
    }
    await b().goToPage(page);
  };

  return [
    // ── Panels ──────────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'view.panel.properties',
      label: 'Properties',
      shortcut: 'F8',
      keywords: ['inspector', 'panel', 'toggle'],
      checked: () => (b().dock ? b().dock!.isShowing('properties') : b().inspectorOpen),
      run: () => {
        const { dock } = b();
        if (!dock) {
          if (!b().inspectorOpen) b().setPanelsVisible(true);
          b().setInspectorOpen(!b().inspectorOpen);
          return;
        }
        if (!dock.isShowing('properties')) b().setPanelsVisible(true);
        dock.toggle('properties');
      },
    }),
    defineCommand({
      id: 'view.panel.instruments',
      label: 'Instruments',
      shortcut: 'F7',
      keywords: ['parts', 'staves', 'add instrument', 'panel', 'toggle'],
      enabled: () => b().dock !== null,
      checked: () => Boolean(b().dock?.isShowing('instruments')),
      run: () => {
        const dock = b().dock;
        if (!dock) return;
        if (!dock.isShowing('instruments')) b().setPanelsVisible(true);
        dock.toggle('instruments');
      },
    }),
    togglePanel(
      'view.panel.aiTools',
      'AI Tools',
      undefined,
      () => b().aiToolsOpen,
      (open) => b().setAiToolsOpen(open),
    ),
    togglePanel(
      'view.panel.scoreSource',
      'Score Source',
      undefined,
      () => b().musicXmlOpen,
      (open) => b().setMusicXmlOpen(open),
    ),
    ...AI_TOOLS.map(({ tool, id, label, needsAi }) =>
      defineCommand({
        id: `ai.open.${id}`,
        label,
        keywords: ['ai', 'tool'],
        enabled: () => !needsAi || b().aiEnabled,
        run: () => {
          b().setPanelsVisible(true);
          b().setAiTool(tool);
          b().setAiToolsOpen(true);
        },
      }),
    ),

    defineCommand({
      id: 'view.panel.history',
      label: 'History',
      keywords: ['checkpoints', 'versions', 'panel'],
      run: () => {
        // The v2 shell has a History activity; the legacy one has the sidebar.
        if (b().dock) {
          b().closeCompare();
          b().setActivity('history');
          return;
        }
        b().setPanelsVisible(true);
        b().setLeftSidebarTab('checkpoints');
        b().setCheckpointsCollapsed(false);
      },
    }),
    ...(
      [
        ['write', 'Write', 'edit the score'],
        ['history', 'History', 'checkpoints versions restore'],
      ] as const
    ).map(([id, label, words]) =>
      defineCommand({
        id: `shell.activity.${id}`,
        label,
        keywords: ['activity', 'mode', ...words.split(' ')],
        enabled: () => b().dock !== null,
        checked: () => !b().compareOpen && b().activity === id,
        run: () => {
          // Leaving a compare session returns to the activity chosen here.
          b().closeCompare();
          b().setActivity(id);
        },
      }),
    ),
    defineCommand({
      id: 'shell.activity.compare',
      label: 'Compare',
      keywords: ['activity', 'mode', 'diff', 'scores'],
      enabled: () => b().dock !== null,
      checked: () => b().compareOpen,
      // A session is entered by state (a checkpoint, a proposal, loaded scores); with none open
      // this starts one by asking which scores to compare.
      run: async () => {
        if (!b().compareOpen) await runCommand('compare.load');
      },
    }),
    defineCommand({
      id: 'view.progressiveLoad',
      label: 'Progressive Load',
      keywords: ['large scores', 'paging'],
      checked: () => b().progressiveLoadEnabled,
      run: () => b().toggleProgressiveLoad(),
    }),

    // ── Checkpoints, recent scores, clipboard ───────────────────────────────────────
    defineCommand({
      id: 'checkpoint.save',
      label: 'Save Checkpoint',
      shortcut: 'Mod+S',
      keywords: ['snapshot', 'history', 'version'],
      enabled: hasScore,
      run: () => b().saveCheckpoint(),
    }),
    defineCommand<{ scoreId: string }>({
      id: 'file.openRecent',
      label: 'Open Recent Score',
      run: (_ctx, args) => {
        const summary = b().scoreSummaries.find((entry) => entry.scoreId === args?.scoreId);
        if (!summary) throw new RangeError(`No recent score "${String(args?.scoreId)}".`);
        b().openScoreFromSummary(summary);
      },
    }),
    defineCommand({
      id: 'edit.copy',
      label: 'Copy',
      shortcut: 'Mod+C',
      enabled: (ctx) => ctx.hasScore && ctx.selection !== 'none',
      run: async () => {
        await b().copySelection();
      },
    }),
    defineCommand({
      id: 'edit.paste',
      label: 'Paste',
      shortcut: 'Mod+V',
      enabled: (ctx) => ctx.isMutable && ctx.selection !== 'none',
      run: async () => {
        await b().pasteSelection();
      },
    }),

    // ── Navigation ──────────────────────────────────────────────────────────────────
    defineCommand({
      id: 'view.goto.nextPage',
      label: 'Next Page',
      keywords: ['go to'],
      enabled: (ctx) => ctx.hasScore && b().pageCount > 1,
      run: () => b().goToNextPage(),
    }),
    defineCommand({
      id: 'view.goto.prevPage',
      label: 'Previous Page',
      keywords: ['go to'],
      enabled: (ctx) => ctx.hasScore && b().pageCount > 1,
      run: () => b().goToPreviousPage(),
    }),
    defineCommand<number>({
      id: 'view.goto.page',
      label: 'Go to Page',
      enabled: hasScore,
      run: async (_ctx, page) => {
        const { pageCount } = b();
        if (!Number.isInteger(page) || page < 1 || page > pageCount) {
          notify({
            kind: 'warning',
            title: `The score has ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
          });
          return;
        }
        await b().goToPage(page - 1);
      },
    }),
    defineCommand<number>({
      id: 'view.goto.bar',
      label: 'Go to Bar',
      enabled: hasScore,
      run: async (_ctx, bar) => {
        const { score } = b();
        if (!score) return;
        await navigate(await pageOfBar(score, bar), `bar ${bar}`);
      },
    }),
    defineCommand<string>({
      id: 'view.goto.rehearsal',
      label: 'Go to Rehearsal Mark',
      enabled: hasScore,
      run: async (_ctx, mark) => {
        const { score } = b();
        if (!score?.saveXml) return;
        const index = measureOfRehearsalMark(await decodeScoreXml(await score.saveXml()), mark);
        await navigate(
          index === null ? null : await pageOfBar(score, index + 1),
          `rehearsal mark ${mark}`,
        );
      },
    }),
  ];
}
