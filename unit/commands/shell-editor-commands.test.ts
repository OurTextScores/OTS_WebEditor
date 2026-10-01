import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_TOOLS,
  buildShellEditorCommands,
  measureOfRehearsalMark,
  pageOfBar,
  type ShellEditorBindings,
} from '../../components/score-editor/shellCommands';
import { clearNotices, getNoticeSnapshot } from '../../components/shell/notices';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import type { CommandContext } from '../../lib/commands/types';
import type { Score } from '../../lib/webmscore-loader';

beforeEach(() => clearNotices());

function setup(over: Partial<ShellEditorBindings> = {}, ctx: Partial<CommandContext> = {}) {
  const calls = {
    goToPage: vi.fn(async () => {}),
    next: vi.fn(),
    previous: vi.fn(),
    setInspectorOpen: vi.fn(),
    setMusicXmlOpen: vi.fn(),
    setAiToolsOpen: vi.fn(),
    setAiTool: vi.fn(),
    setPanelsVisible: vi.fn(),
    saveCheckpoint: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    openScore: vi.fn(),
    setCheckpointsCollapsed: vi.fn(),
    setLeftSidebarTab: vi.fn(),
    toggleProgressive: vi.fn(),
  };
  const bindings: ShellEditorBindings = {
    score: null,
    aiEnabled: true,
    pageCount: 5,
    currentPage: 0,
    goToPage: calls.goToPage,
    goToNextPage: calls.next,
    goToPreviousPage: calls.previous,
    inspectorOpen: false,
    setInspectorOpen: calls.setInspectorOpen,
    musicXmlOpen: false,
    setMusicXmlOpen: calls.setMusicXmlOpen,
    aiToolsOpen: false,
    setAiToolsOpen: calls.setAiToolsOpen,
    setAiTool: calls.setAiTool,
    setPanelsVisible: calls.setPanelsVisible,
    saveCheckpoint: calls.saveCheckpoint,
    copySelection: calls.copy,
    pasteSelection: calls.paste,
    scoreSummaries: [{ scoreId: 'a', title: 'A', lastUpdated: 1, count: 1 }],
    openScoreFromSummary: calls.openScore,
    setCheckpointsCollapsed: calls.setCheckpointsCollapsed,
    setLeftSidebarTab: calls.setLeftSidebarTab,
    zoom: 1,
    isPlaying: false,
    isPaused: false,
    interactionPreparing: false,
    dirty: false,
    checkpointCount: 0,
    pageCountIsFloor: false,
    progressiveLoadEnabled: true,
    toggleProgressiveLoad: calls.toggleProgressive,
    ...over,
  };
  const context: CommandContext = {
    ...DEFAULT_COMMAND_CONTEXT,
    hasScore: true,
    isMutable: true,
    selection: 'single',
    ...ctx,
  };
  const registry = new CommandRegistry();
  let current = bindings;
  registry.register(
    'global',
    buildShellEditorCommands(() => current),
  );
  registry.setContextSource(() => context);
  return {
    registry,
    calls,
    setBindings: (next: ShellEditorBindings) => (current = next),
    bindings,
  };
}

const scoreWith = (extra: Partial<Score>): Score => extra as unknown as Score;

describe('panel toggles', () => {
  it.each([
    ['view.panel.properties', 'inspectorOpen', 'setInspectorOpen'],
    ['view.panel.scoreSource', 'musicXmlOpen', 'setMusicXmlOpen'],
    ['view.panel.aiTools', 'aiToolsOpen', 'setAiToolsOpen'],
  ] as const)('%s opens a closed panel and closes an open one', async (id, flag, setter) => {
    const closed = setup();
    await closed.registry.run(id);
    expect(closed.calls[setter]).toHaveBeenCalledWith(true);

    const open = setup({ [flag]: true } as Partial<ShellEditorBindings>);
    await open.registry.run(id);
    expect(open.calls[setter]).toHaveBeenCalledWith(false);
  });

  it('brings hidden panels back when it opens one, but not when it closes one', async () => {
    const closed = setup();
    await closed.registry.run('view.panel.properties');
    expect(closed.calls.setPanelsVisible).toHaveBeenCalledWith(true);

    const open = setup({ inspectorOpen: true });
    await open.registry.run('view.panel.properties');
    expect(open.calls.setPanelsVisible).not.toHaveBeenCalled();
  });

  it('reports the panel’s state as checked, from the latest bindings', () => {
    const { registry, setBindings, bindings } = setup();
    const entry = registry.get('view.panel.properties') as unknown as {
      checked: (ctx: CommandContext) => boolean;
    };
    expect(entry.checked(registry.getContext())).toBe(false);
    setBindings({ ...bindings, inspectorOpen: true });
    expect(entry.checked(registry.getContext())).toBe(true);
  });
});

describe('ai.open.*', () => {
  it('registers one command per tool', () => {
    const { registry } = setup();
    expect(AI_TOOLS.map((tool) => registry.has(`ai.open.${tool.id}`))).toEqual(
      AI_TOOLS.map(() => true),
    );
  });

  it('selects the tool, opens the sidebar and brings panels back', async () => {
    const { registry, calls } = setup();
    await registry.run('ai.open.notagen');
    expect(calls.setAiTool).toHaveBeenCalledWith('notagen');
    expect(calls.setAiToolsOpen).toHaveBeenCalledWith(true);
    expect(calls.setPanelsVisible).toHaveBeenCalledWith(true);
  });

  it('offers only the tools that run without the AI proxy when it is off', async () => {
    const { registry } = setup({ aiEnabled: false });
    expect(await registry.run('ai.open.assistant')).toBe('disabled');
    expect(await registry.run('ai.open.notagen')).toBe('disabled');
    expect(await registry.run('ai.open.transcoda')).toBe('ran');
    expect(await registry.run('ai.open.mma')).toBe('ran');
  });

  it('maps ids to the tab names the sidebar uses', () => {
    expect(Object.fromEntries(AI_TOOLS.map((t) => [t.id, t.tool]))).toEqual({
      assistant: 'assistant',
      notagen: 'notagen',
      transcoda: 'transcoda',
      multitrack: 'multitrack',
      harmony: 'harmony',
      functional: 'functional',
      mma: 'mma',
    });
  });
});

describe('History and progressive load', () => {
  it('opens the History panel on the checkpoint list, bringing hidden panels back', async () => {
    const { registry, calls } = setup();
    await registry.run('view.panel.history');
    expect(calls.setPanelsVisible).toHaveBeenCalledWith(true);
    expect(calls.setLeftSidebarTab).toHaveBeenCalledWith('checkpoints');
    expect(calls.setCheckpointsCollapsed).toHaveBeenCalledWith(false);
  });

  it('toggles progressive load and reports its state as checked', async () => {
    const { registry, calls } = setup({ progressiveLoadEnabled: false });
    await registry.run('view.progressiveLoad');
    expect(calls.toggleProgressive).toHaveBeenCalledOnce();
    const entry = registry.get('view.progressiveLoad') as unknown as { checked: () => boolean };
    expect(entry.checked()).toBe(false);
  });
});

describe('checkpoints, recents and clipboard', () => {
  it('saves a checkpoint only with a score', async () => {
    const withScore = setup();
    expect(await withScore.registry.run('checkpoint.save')).toBe('ran');
    expect(withScore.calls.saveCheckpoint).toHaveBeenCalledOnce();

    const without = setup({}, { hasScore: false });
    expect(await without.registry.run('checkpoint.save')).toBe('disabled');
  });

  it('opens a recent score by id, and rejects one that is gone', async () => {
    const { registry, calls } = setup();
    await registry.run('file.openRecent', { scoreId: 'a' });
    expect(calls.openScore).toHaveBeenCalledWith(expect.objectContaining({ scoreId: 'a' }));
    await expect(registry.run('file.openRecent', { scoreId: 'zzz' })).rejects.toThrow(RangeError);
  });

  it('copies and pastes through the editor’s handlers, gated on selection', async () => {
    const { registry, calls } = setup();
    await registry.run('edit.copy');
    await registry.run('edit.paste');
    expect(calls.copy).toHaveBeenCalledOnce();
    expect(calls.paste).toHaveBeenCalledOnce();

    const none = setup({}, { selection: 'none' });
    expect(await none.registry.run('edit.copy')).toBe('disabled');
    expect(await none.registry.run('edit.paste')).toBe('disabled');
  });

  it('will not paste into a read-only surface', async () => {
    const { registry } = setup({}, { isMutable: false });
    expect(await registry.run('edit.paste')).toBe('disabled');
  });
});

describe('paging', () => {
  it('steps through the editor’s own page handlers', async () => {
    const { registry, calls } = setup();
    await registry.run('view.goto.nextPage');
    await registry.run('view.goto.prevPage');
    expect(calls.next).toHaveBeenCalledOnce();
    expect(calls.previous).toHaveBeenCalledOnce();
  });

  it('has nowhere to step in a one-page score', async () => {
    const { registry } = setup({ pageCount: 1 });
    expect(await registry.run('view.goto.nextPage')).toBe('disabled');
  });

  it('goes to a one-based page, as the palette’s p3 says it', async () => {
    const { registry, calls } = setup();
    await registry.run('view.goto.page', 3);
    expect(calls.goToPage).toHaveBeenCalledWith(2);
  });

  it.each([0, 6, -1, 2.5, Number.NaN])('warns instead of going to page %s', async (page) => {
    const { registry, calls } = setup({ pageCount: 5 });
    await registry.run('view.goto.page', page);
    expect(calls.goToPage).not.toHaveBeenCalled();
    expect(getNoticeSnapshot().notices.at(-1)).toMatchObject({
      kind: 'warning',
      title: 'The score has 5 pages.',
    });
  });

  it('says "1 page" in the singular', async () => {
    const { registry } = setup({ pageCount: 1 });
    await registry.run('view.goto.page', 2);
    expect(getNoticeSnapshot().notices.at(-1)?.title).toBe('The score has 1 page.');
  });
});

describe('bar navigation', () => {
  const positions = (pages: number[]) => ({
    elements: pages.map((page, id) => ({ id, x: 0, y: 0, sx: 1, sy: 1, page })),
  });

  it('finds the page a bar is on from the engine’s per-measure boxes', async () => {
    const score = scoreWith({ measurePositions: async () => positions([0, 0, 1, 2]) as never });
    expect(await pageOfBar(score, 1)).toBe(0);
    expect(await pageOfBar(score, 3)).toBe(1);
    expect(await pageOfBar(score, 4)).toBe(2);
    expect(await pageOfBar(score, 5)).toBeNull();
    expect(await pageOfBar(score, 0)).toBeNull();
  });

  it('goes to the page the bar is on', async () => {
    const score = scoreWith({ measurePositions: async () => positions([0, 1, 1, 2]) as never });
    const { registry, calls } = setup({ score });
    await registry.run('view.goto.bar', 3);
    expect(calls.goToPage).toHaveBeenCalledWith(1);
  });

  it('warns when the bar does not exist', async () => {
    const score = scoreWith({ measurePositions: async () => positions([0]) as never });
    const { registry, calls } = setup({ score });
    await registry.run('view.goto.bar', 99);
    expect(calls.goToPage).not.toHaveBeenCalled();
    expect(getNoticeSnapshot().notices.at(-1)).toMatchObject({
      kind: 'warning',
      title: 'Could not find bar 99.',
    });
  });

  it('does nothing without a score', async () => {
    const { registry, calls } = setup({ score: null });
    await registry.run('view.goto.bar', 1);
    expect(calls.goToPage).not.toHaveBeenCalled();
  });
});

describe('rehearsal mark navigation', () => {
  const xml = (marks: Record<number, string>) =>
    `<score-partwise><part id="P1">${[0, 1, 2, 3]
      .map(
        (i) =>
          `<measure number="${i + 1}">${
            marks[i]
              ? `<direction><direction-type><rehearsal>${marks[i]}</rehearsal></direction-type></direction>`
              : ''
          }</measure>`,
      )
      .join(
        '',
      )}</part><part id="P2"><measure number="1"><direction><direction-type><rehearsal>X</rehearsal></direction-type></direction></measure></part></score-partwise>`;

  it('finds the measure carrying a mark, case-insensitively, in the first part', () => {
    const doc = xml({ 1: 'A', 3: 'B' });
    expect(measureOfRehearsalMark(doc, 'a')).toBe(1);
    expect(measureOfRehearsalMark(doc, 'B')).toBe(3);
    expect(measureOfRehearsalMark(doc, 'C')).toBeNull();
    // Only the first part decides measure numbering; another part's mark is not a bar.
    expect(measureOfRehearsalMark(doc, 'X')).toBeNull();
  });

  it('takes the first measure when a mark repeats', () => {
    expect(measureOfRehearsalMark(xml({ 1: 'A', 2: 'A' }), 'A')).toBe(1);
  });

  it('treats unparseable XML as not found', () => {
    expect(measureOfRehearsalMark('<not xml', 'A')).toBeNull();
  });

  it('goes to the page of the measure carrying the mark', async () => {
    const score = scoreWith({
      saveXml: async () => new TextEncoder().encode(xml({ 2: 'B' })),
      measurePositions: async () =>
        ({ elements: [0, 0, 1, 1].map((page, id) => ({ id, page })) }) as never,
    });
    const { registry, calls } = setup({ score });
    await registry.run('view.goto.rehearsal', 'B');
    expect(calls.goToPage).toHaveBeenCalledWith(1);
  });

  it('warns when no measure has the mark', async () => {
    const score = scoreWith({
      saveXml: async () => new TextEncoder().encode(xml({})),
      measurePositions: async () => ({ elements: [] }) as never,
    });
    const { registry, calls } = setup({ score });
    await registry.run('view.goto.rehearsal', 'Z');
    expect(calls.goToPage).not.toHaveBeenCalled();
    expect(getNoticeSnapshot().notices.at(-1)?.title).toBe('Could not find rehearsal mark Z.');
  });
});
