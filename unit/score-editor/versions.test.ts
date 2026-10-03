// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitCurrentVersion,
  type CommitCurrentVersionContext,
} from '../../components/score-editor/versions';
import { OurTextScoresApiError } from '../../lib/ourtextscores-api-client';

const notices = vi.hoisted(() => ({ notifyWarning: vi.fn() }));
vi.mock('../../components/shell/notices', () => notices);
const api = vi.hoisted(() => ({ commitSourceRevision: vi.fn() }));
vi.mock('../../lib/ourtextscores-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/ourtextscores-api-client')>()),
  commitSourceRevision: api.commitSourceRevision,
}));

function context(over: Partial<Record<keyof CommitCurrentVersionContext, unknown>> = {}) {
  const ctx = {
    otsSourceContext: { workId: 'w1', sourceId: 's1', revisionId: 'ctxRev' },
    score: {},
    setVersionsActionBusy: vi.fn(),
    setVersionsActionError: vi.fn(),
    setVersionsActionNotice: vi.fn(),
    getScoreXmlData: vi.fn(async () => new Uint8Array([60, 120, 62])),
    versionsBranchName: ' dev ',
    sourceHistory: null,
    activeLaunchContext: null,
    scoreTitle: 'My: Etude',
    versionsCommitMessage: ' fix bar 3 ',
    setRuntimeLaunchContext: vi.fn(),
    setVersionsCommitMessage: vi.fn(),
    setVersionsBranchName: vi.fn(),
    refreshSourceHistory: vi.fn(async () => undefined),
    ...over,
  };
  return ctx as unknown as CommitCurrentVersionContext & typeof ctx;
}
// jsdom's FormData does not keep the name of a File built by Node, so what is appended is recorded.
let appended: Array<[string, unknown]> = [];
const form = () => ({
  get: (key: string) => appended.find(([name]) => name === key)?.[1] ?? null,
  has: (key: string) => appended.some(([name]) => name === key),
});

beforeEach(() => {
  vi.clearAllMocks();
  appended = [];
  vi.spyOn(FormData.prototype, 'append').mockImplementation(function (
    name: string,
    value: unknown,
  ) {
    appended.push([name, value]);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  api.commitSourceRevision.mockResolvedValue({ revisionId: 'newRev', message: 'Committed.' });
});

describe('commitCurrentVersion', () => {
  it('does nothing for a score that is not an OurTextScores source, and asks for a score first', async () => {
    const none = context({ otsSourceContext: null });
    await commitCurrentVersion(none);
    expect(none.setVersionsActionBusy).not.toHaveBeenCalled();
    const noScore = context({ score: null });
    await commitCurrentVersion(noScore);
    expect(notices.notifyWarning).toHaveBeenCalledWith('Load a score before creating a version.');
    expect(api.commitSourceRevision).not.toHaveBeenCalled();
  });

  it('commits the MusicXML as a file named for the score, with the trimmed message and branch', async () => {
    const ctx = context();
    await commitCurrentVersion(ctx);
    expect(api.commitSourceRevision).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'w1', sourceId: 's1' }),
    );
    const body = form();
    const file = body.get('file') as File;
    expect(file.name).toBe('My_ Etude.musicxml');
    expect(file.type).toBe('application/xml');
    expect(body.get('commitMessage')).toBe('fix bar 3');
    expect(body.get('branchName')).toBe('dev');
    expect(vi.mocked(ctx.setVersionsActionBusy).mock.calls).toEqual([[true], [false]]);
  });

  it('falls back to the source id for the file name, to trunk for the branch, and omits an empty message', async () => {
    const ctx = context({ scoreTitle: '', versionsBranchName: ' ', versionsCommitMessage: '  ' });
    await commitCurrentVersion(ctx);
    const body = form();
    expect((body.get('file') as File).name).toBe('s1.musicxml');
    expect(body.get('branchName')).toBe('trunk');
    expect(body.has('commitMessage')).toBe(false);
  });

  it('commits on top of the best known revision: branch head, then branch base, then the source, then the launch', async () => {
    const expectRevision = async (over: Parameters<typeof context>[0], expected: string | null) => {
      vi.mocked(api.commitSourceRevision).mockClear();
      appended = [];
      await commitCurrentVersion(context(over));
      const body = form();
      expect(body.get('expectedHeadRevisionId')).toBe(expected);
      expect(body.get('baseRevisionId')).toBe(expected);
    };
    const branch = (fields: Record<string, unknown>) => ({
      sourceHistory: { selectedBranch: fields },
    });
    await expectRevision(branch({ headRevisionId: 'head', baseRevisionId: 'base' }), 'head');
    await expectRevision(branch({ baseRevisionId: 'base' }), 'base');
    await expectRevision({}, 'ctxRev');
    await expectRevision(
      {
        otsSourceContext: { workId: 'w1', sourceId: 's1' },
        activeLaunchContext: { revisionId: 'launchRev' },
      },
      'launchRev',
    );
    await expectRevision({ otsSourceContext: { workId: 'w1', sourceId: 's1' } }, null);
  });

  it('records the new revision as the launch context and refreshes the history for the branch', async () => {
    const ctx = context();
    await commitCurrentVersion(ctx);
    expect(ctx.setRuntimeLaunchContext).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ourtextscores',
        workId: 'w1',
        sourceId: 's1',
        revisionId: 'newRev',
        branchName: 'dev',
      }),
    );
    expect(ctx.setVersionsCommitMessage).toHaveBeenCalledWith('');
    expect(ctx.setVersionsBranchName).toHaveBeenCalledWith('dev');
    expect(ctx.setVersionsActionNotice).toHaveBeenLastCalledWith('Committed.');
    expect(ctx.refreshSourceHistory).toHaveBeenCalledWith('dev');
  });

  it('says "Created a new revision." when the server sends no message', async () => {
    api.commitSourceRevision.mockResolvedValue({ revisionId: 'r2' });
    const ctx = context();
    await commitCurrentVersion(ctx);
    expect(ctx.setVersionsActionNotice).toHaveBeenLastCalledWith('Created a new revision.');
  });

  it('refuses to commit to a branch whose change review is closed, without calling the server', async () => {
    const ctx = context({ sourceHistory: { selectedBranch: { lifecycle: 'closed' } } });
    await commitCurrentVersion(ctx);
    expect(ctx.setVersionsActionError).toHaveBeenLastCalledWith(
      'This branch is closed while its change review is closed. Reopen the CR before committing.',
    );
    expect(api.commitSourceRevision).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.setVersionsActionBusy).mock.calls.at(-1)).toEqual([false]);
  });

  it('does not commit when the score has no data', async () => {
    const ctx = context({ getScoreXmlData: vi.fn(async () => null) });
    await commitCurrentVersion(ctx);
    expect(api.commitSourceRevision).not.toHaveBeenCalled();
    expect(ctx.setVersionsActionError).toHaveBeenCalledTimes(1); // only the reset
  });

  it('explains a conflict: branch closed for review, or the head moved (with its number when known)', async () => {
    const conflict = (details: unknown) =>
      api.commitSourceRevision.mockRejectedValue(
        new OurTextScoresApiError('conflict', 409, details),
      );
    const run = async () => {
      const ctx = context();
      await commitCurrentVersion(ctx);
      return vi.mocked(ctx.setVersionsActionError).mock.calls.at(-1)![0];
    };
    conflict({ error: 'branch_closed_for_review' });
    expect(await run()).toBe(
      'This branch is closed while its change review is closed. Reopen the CR before committing.',
    );
    conflict({ actualHeadSequenceNumber: 12 });
    expect(await run()).toBe(
      'Branch head changed. Refresh and review revision #12 before committing.',
    );
    conflict({});
    expect(await run()).toBe(
      'Branch head changed. Refresh and review the latest branch revision before committing.',
    );
  });

  it('shows any other failure, and frees the busy state', async () => {
    api.commitSourceRevision.mockRejectedValue(new Error('network down'));
    const ctx = context();
    await commitCurrentVersion(ctx);
    expect(ctx.setVersionsActionError).toHaveBeenLastCalledWith('network down');
    expect(ctx.setRuntimeLaunchContext).not.toHaveBeenCalled();
    expect(vi.mocked(ctx.setVersionsActionBusy).mock.calls.at(-1)).toEqual([false]);
  });
});
