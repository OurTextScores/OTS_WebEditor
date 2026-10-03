import { asRecord } from '../../lib/as-record';
import {
  sanitizeEditorLaunchContext,
  type EditorLaunchContext,
} from '../../lib/editor-launch-context';
import {
  OurTextScoresApiError,
  buildSourceCanonicalXmlUrl,
  commitSourceRevision,
} from '../../lib/ourtextscores-api-client';
import { notifyWarning } from '../shell/notices';
import { toOwnedBytes } from './byte-encoding';
import { toSafeFilename } from './checkpoint-labels';
import { errorMessage } from './error-messages';
import type { SourceHistoryResponse } from '../../lib/ourtextscores-api-client';
import type { Score } from '../../lib/webmscore-loader';
import type React from 'react';

export type CommitCurrentVersionContext = {
  otsSourceContext: {
    workId: string;
    sourceId: string;
    revisionId: string | undefined;
    branchName: string;
    canonicalXmlUrl: string | undefined;
  } | null;
  score: Score | null;
  setVersionsActionBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setVersionsActionError: React.Dispatch<React.SetStateAction<string | null>>;
  setVersionsActionNotice: React.Dispatch<React.SetStateAction<string | null>>;
  getScoreXmlData: () => Promise<Uint8Array<ArrayBufferLike> | null>;
  versionsBranchName: string;
  sourceHistory: SourceHistoryResponse | null;
  activeLaunchContext: EditorLaunchContext | null;
  scoreTitle: string;
  versionsCommitMessage: string;
  setRuntimeLaunchContext: React.Dispatch<React.SetStateAction<EditorLaunchContext | null>>;
  setVersionsCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  setVersionsBranchName: React.Dispatch<React.SetStateAction<string>>;
  refreshSourceHistory: (branchNameOverride?: string) => Promise<void>;
};

export async function commitCurrentVersion(ctx: CommitCurrentVersionContext) {
  const {
    otsSourceContext,
    score,
    setVersionsActionBusy,
    setVersionsActionError,
    setVersionsActionNotice,
    getScoreXmlData,
    versionsBranchName,
    sourceHistory,
    activeLaunchContext,
    scoreTitle,
    versionsCommitMessage,
    setRuntimeLaunchContext,
    setVersionsCommitMessage,
    setVersionsBranchName,
    refreshSourceHistory,
  } = ctx;
  if (!otsSourceContext) {
    return;
  }
  if (!score) {
    notifyWarning('Load a score before creating a version.');
    return;
  }
  setVersionsActionBusy(true);
  setVersionsActionError(null);
  setVersionsActionNotice(null);
  try {
    const data = await getScoreXmlData();
    if (!data) {
      return;
    }
    const branch = versionsBranchName.trim() || 'trunk';
    const selectedBranch = sourceHistory?.selectedBranch;
    if (selectedBranch?.lifecycle === 'closed') {
      setVersionsActionError(
        'This branch is closed while its change review is closed. Reopen the CR before committing.',
      );
      return;
    }
    const targetRevisionId =
      selectedBranch?.headRevisionId ||
      selectedBranch?.baseRevisionId ||
      otsSourceContext.revisionId ||
      activeLaunchContext?.revisionId ||
      undefined;
    const filenameBase = scoreTitle ? toSafeFilename(scoreTitle) : otsSourceContext.sourceId;
    const file = new File([toOwnedBytes(data)], `${filenameBase || 'score'}.musicxml`, {
      type: 'application/xml',
    });
    const form = new FormData();
    form.append('file', file);
    if (versionsCommitMessage.trim()) {
      form.append('commitMessage', versionsCommitMessage.trim());
    }
    form.append('branchName', branch);
    if (targetRevisionId) {
      form.append('expectedHeadRevisionId', targetRevisionId);
      form.append('baseRevisionId', targetRevisionId);
    }

    const result = await commitSourceRevision({
      workId: otsSourceContext.workId,
      sourceId: otsSourceContext.sourceId,
      body: form,
    });
    const nextRevisionId = result.revisionId;
    setRuntimeLaunchContext(
      sanitizeEditorLaunchContext({
        ...(activeLaunchContext || {}),
        source: 'ourtextscores',
        workId: otsSourceContext.workId,
        sourceId: otsSourceContext.sourceId,
        revisionId: nextRevisionId,
        branchName: branch,
        canonicalXmlUrl: buildSourceCanonicalXmlUrl({
          workId: otsSourceContext.workId,
          sourceId: otsSourceContext.sourceId,
          revisionId: nextRevisionId,
        }),
      } satisfies EditorLaunchContext),
    );
    setVersionsCommitMessage('');
    setVersionsBranchName(branch);
    setVersionsActionNotice(result.message || 'Created a new revision.');
    await refreshSourceHistory(branch);
  } catch (err) {
    console.error('Failed to commit source revision', err);
    if (err instanceof OurTextScoresApiError && err.status === 409) {
      const details = asRecord(err.details);
      if (details?.error === 'branch_closed_for_review') {
        setVersionsActionError(
          'This branch is closed while its change review is closed. Reopen the CR before committing.',
        );
      } else {
        const actualHeadSequenceNumber =
          typeof details?.actualHeadSequenceNumber === 'number'
            ? details.actualHeadSequenceNumber
            : null;
        setVersionsActionError(
          actualHeadSequenceNumber !== null
            ? `Branch head changed. Refresh and review revision #${actualHeadSequenceNumber} before committing.`
            : 'Branch head changed. Refresh and review the latest branch revision before committing.',
        );
      }
    } else {
      setVersionsActionError(errorMessage(err) || 'Failed to commit current score.');
    }
  } finally {
    setVersionsActionBusy(false);
  }
}
