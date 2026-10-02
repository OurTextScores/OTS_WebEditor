import React from 'react';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import type { CheckpointSummary, ScoreSummary } from '../../lib/checkpoints';
import type {
  SourceHistoryBranch,
  SourceHistoryRevision,
} from '../../lib/ourtextscores-api-client';

export type LeftSidebarTab = 'versions' | 'checkpoints' | 'scores';

type ScoreIdSummary = {
  title: string;
  detail: string;
  type: 'url' | 'file' | 'new' | 'legacy' | 'other';
};

type LeftSidebarProps = {
  onRefresh: () => void;
  checkpointControlsDisabled: boolean;
  leftSidebarTab: LeftSidebarTab;
  onTabChange: (tab: LeftSidebarTab) => void;
  showVersionsTab?: boolean;
  versionsLoading?: boolean;
  versionsError?: string | null;
  versionsBranchName?: string;
  versionsBranches?: SourceHistoryBranch[];
  versionsSelectedBranch?: SourceHistoryBranch | null;
  versionsRevisions?: SourceHistoryRevision[];
  versionsCanCreateBranch?: boolean;
  versionsCanCommit?: boolean;
  versionsActionBusy?: boolean;
  versionsActionError?: string | null;
  versionsActionNotice?: string | null;
  versionsStatusMode?: 'tracking' | 'detached';
  versionsStatusMessage?: string | null;
  versionsSelectedBaseRevisionId?: string | null;
  versionsLoadBranchLabel?: string;
  versionsCommitMessage?: string;
  onVersionsCommitMessageChange?: (value: string) => void;
  onVersionsCommitCurrent?: () => void;
  versionsCreateBranchName?: string;
  onVersionsCreateBranchNameChange?: (value: string) => void;
  versionsCreateBranchPolicy?: 'public' | 'owner_approval';
  onVersionsCreateBranchPolicyChange?: (value: 'public' | 'owner_approval') => void;
  onVersionsCreateBranch?: () => void;
  onVersionsBranchChange?: (branchName: string) => void;
  onVersionsRefresh?: () => void;
  onVersionsOpenRevision?: (revision: SourceHistoryRevision) => void;
  onVersionsDiffRevision?: (revision: SourceHistoryRevision) => void;
  onVersionsSelectBaseRevision?: (revision: SourceHistoryRevision | null) => void;
  onVersionsDiffAgainstBase?: (revision: SourceHistoryRevision) => void;
  onVersionsLoadBranchHead?: () => void;
  onVersionsOpenChangeReview?: (revision: SourceHistoryRevision) => void;
  checkpointLabel: string;
  onCheckpointLabelChange: (value: string) => void;
  onSaveCheckpoint: () => void;
  checkpointSaveDisabled: boolean;
  scoreLoaded: boolean;
  checkpointError: string | null;
  checkpointLoading: boolean;
  checkpoints: CheckpointSummary[];
  checkpointCompareDisabled: boolean;
  onRestoreCheckpoint: (checkpoint: CheckpointSummary) => void;
  onCompareCheckpoint: (checkpoint: CheckpointSummary) => void;
  onRenameCheckpoint: (checkpoint: CheckpointSummary) => void;
  onDeleteCheckpoint: (checkpoint: CheckpointSummary) => void;
  scoreDirtySinceCheckpoint: boolean;
  scoreSummariesError: string | null;
  scoreSummariesLoading: boolean;
  scoreSummaries: ScoreSummary[];
  currentScoreId: string;
  onOpenScoreFromSummary: (summary: ScoreSummary) => void;
  formatTimestamp: (timestamp: number) => string;
  formatBytes: (bytes: number) => string;
  summarizeScoreId: (id: string) => ScoreIdSummary;
};

function VersionsTabPanel(
  props: Pick<
    LeftSidebarProps,
    | 'versionsLoading'
    | 'versionsError'
    | 'versionsBranchName'
    | 'versionsBranches'
    | 'versionsSelectedBranch'
    | 'versionsRevisions'
    | 'versionsCanCreateBranch'
    | 'versionsCanCommit'
    | 'versionsActionBusy'
    | 'versionsActionError'
    | 'versionsActionNotice'
    | 'versionsStatusMode'
    | 'versionsStatusMessage'
    | 'versionsSelectedBaseRevisionId'
    | 'versionsLoadBranchLabel'
    | 'versionsCommitMessage'
    | 'onVersionsCommitMessageChange'
    | 'onVersionsCommitCurrent'
    | 'versionsCreateBranchName'
    | 'onVersionsCreateBranchNameChange'
    | 'versionsCreateBranchPolicy'
    | 'onVersionsCreateBranchPolicyChange'
    | 'onVersionsCreateBranch'
    | 'onVersionsBranchChange'
    | 'onVersionsRefresh'
    | 'onVersionsOpenRevision'
    | 'onVersionsDiffRevision'
    | 'onVersionsSelectBaseRevision'
    | 'onVersionsDiffAgainstBase'
    | 'onVersionsLoadBranchHead'
    | 'onVersionsOpenChangeReview'
  >,
) {
  const {
    versionsLoading = false,
    versionsError = null,
    versionsBranchName = 'trunk',
    versionsBranches = [],
    versionsSelectedBranch = null,
    versionsRevisions = [],
    versionsCanCreateBranch = false,
    versionsCanCommit = false,
    versionsActionBusy = false,
    versionsActionError = null,
    versionsActionNotice = null,
    versionsStatusMode = 'tracking',
    versionsStatusMessage = null,
    versionsSelectedBaseRevisionId = null,
    versionsLoadBranchLabel = 'Load branch head',
    versionsCommitMessage = '',
    onVersionsCommitMessageChange,
    onVersionsCommitCurrent,
    versionsCreateBranchName = '',
    onVersionsCreateBranchNameChange,
    versionsCreateBranchPolicy = 'public',
    onVersionsCreateBranchPolicyChange,
    onVersionsCreateBranch,
    onVersionsBranchChange,
    onVersionsRefresh,
    onVersionsOpenRevision,
    onVersionsDiffRevision,
    onVersionsSelectBaseRevision,
    onVersionsDiffAgainstBase,
    onVersionsLoadBranchHead,
    onVersionsOpenChangeReview,
  } = props;
  const selectedBaseRevision = versionsSelectedBaseRevisionId
    ? (versionsRevisions.find(
        (revision) => revision.revisionId === versionsSelectedBaseRevisionId,
      ) ?? null)
    : null;
  const versionsStatusStyle =
    versionsStatusMode === 'detached'
      ? { borderColor: 'var(--ots-warning)', backgroundColor: '#fde68a', color: '#451a03' }
      : { borderColor: 'var(--ots-success)', backgroundColor: '#bbf7d0', color: '#052e16' };

  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <select
          value={versionsBranchName}
          onChange={(event) => onVersionsBranchChange?.(event.target.value)}
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        >
          {versionsBranches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))}
        </select>
        <Button variant="neutral" size="sm" onClick={onVersionsRefresh}>
          Refresh
        </Button>
      </div>
      {versionsSelectedBranch && (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          <div className="font-medium text-slate-800">
            {versionsSelectedBranch.policy === 'owner_approval'
              ? 'Owner approval required'
              : 'Open branch'}
          </div>
          <div>
            Lifecycle:{' '}
            {versionsSelectedBranch.lifecycle === 'closed' ? 'Closed for review' : 'Open'}
          </div>
          <div>
            {versionsSelectedBranch.commitCount} commit
            {versionsSelectedBranch.commitCount === 1 ? '' : 's'}
          </div>
          {versionsSelectedBranch.empty && versionsSelectedBranch.baseRevisionId && (
            <div>Based on {versionsSelectedBranch.baseRevisionId}</div>
          )}
          <Button
            variant="neutral"
            size="sm"
            onClick={onVersionsLoadBranchHead}
            disabled={versionsActionBusy}
            className="mt-2"
          >
            {versionsActionBusy ? 'Working...' : versionsLoadBranchLabel}
          </Button>
        </div>
      )}
      {versionsStatusMessage && (
        <div
          className="mt-3 rounded border px-2 py-2 text-sm font-semibold"
          style={versionsStatusStyle}
        >
          {versionsStatusMessage}
        </div>
      )}
      {versionsSelectedBaseRevisionId && (
        <div className="mt-3 rounded border border-line bg-surface-sunken px-2 py-2 text-xs text-ink">
          Base revision selected for diff:{' '}
          {selectedBaseRevision
            ? `#${selectedBaseRevision.sequenceNumber}`
            : versionsSelectedBaseRevisionId}
        </div>
      )}
      <div className="mt-3 rounded border border-slate-200 p-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Commit Current Score
        </div>
        <Textarea
          value={versionsCommitMessage}
          onChange={(event) => onVersionsCommitMessageChange?.(event.target.value)}
          placeholder="Commit message"
          rows={3}
          className="mt-2"
        />
        <Button
          variant="primary"
          size="md"
          onClick={onVersionsCommitCurrent}
          disabled={versionsActionBusy || !versionsCanCommit}
          className="mt-2 w-full"
        >
          {versionsActionBusy ? 'Working...' : 'Commit current score'}
        </Button>
        {!versionsCanCommit && (
          <div className="mt-2 text-xs text-slate-500">
            {versionsSelectedBranch?.lifecycle === 'closed'
              ? 'This branch is closed while its change review is closed. Reopen the CR to commit again.'
              : 'Sign in with commit access to create a server revision.'}
          </div>
        )}
      </div>
      <div className="mt-3 rounded border border-slate-200 p-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Create Branch
        </div>
        <Input
          value={versionsCreateBranchName}
          onChange={(event) => onVersionsCreateBranchNameChange?.(event.target.value)}
          placeholder="new-branch"
          className="mt-2"
        />
        <select
          value={versionsCreateBranchPolicy}
          onChange={(event) =>
            onVersionsCreateBranchPolicyChange?.(event.target.value as 'public' | 'owner_approval')
          }
          className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        >
          <option value="public">Open</option>
          <option value="owner_approval">Owner approval required</option>
        </select>
        <Button
          variant="neutral"
          size="md"
          onClick={onVersionsCreateBranch}
          disabled={
            versionsActionBusy || !versionsCanCreateBranch || !versionsCreateBranchName.trim()
          }
          className="mt-2 w-full"
        >
          {versionsActionBusy ? 'Working...' : 'Create branch'}
        </Button>
        {!versionsCanCreateBranch && (
          <div className="mt-2 text-xs text-slate-500">Sign in to create a branch.</div>
        )}
      </div>
      {versionsError && <div className="mt-3 text-xs text-red-600">{versionsError}</div>}
      {versionsActionError && (
        <div className="mt-3 text-xs text-red-600">{versionsActionError}</div>
      )}
      {versionsActionNotice && (
        <div className="mt-3 text-xs text-emerald-700">{versionsActionNotice}</div>
      )}
      {versionsLoading && <div className="mt-3 text-xs text-slate-500">Loading versions...</div>}
      {!versionsLoading && versionsRevisions.length === 0 && (
        <div className="mt-3 text-xs text-slate-500">No revisions on this branch yet.</div>
      )}
      <div className="mt-3 space-y-3">
        {versionsRevisions.map((revision) => (
          <div
            key={revision.revisionId}
            className={`rounded border p-2 ${versionsSelectedBaseRevisionId === revision.revisionId ? 'border-accent/40 bg-accent-soft' : 'border-slate-200'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-800">#{revision.sequenceNumber}</div>
              {revision.isBranchHead && (
                <span className="text-caption font-semibold uppercase text-ink-muted">Head</span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {revision.changeSummary || 'No change summary'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {new Date(revision.createdAt).toLocaleString()}
              {revision.createdByUsername ? ` · ${revision.createdByUsername}` : ''}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="neutral"
                size="sm"
                onClick={() => onVersionsOpenRevision?.(revision)}
              >
                Open
              </Button>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => onVersionsDiffRevision?.(revision)}
              >
                Diff vs current
              </Button>
              <Button
                variant="neutral"
                size="sm"
                onClick={() =>
                  onVersionsSelectBaseRevision?.(
                    versionsSelectedBaseRevisionId === revision.revisionId ? null : revision,
                  )
                }
              >
                {versionsSelectedBaseRevisionId === revision.revisionId ? 'Clear base' : 'Set base'}
              </Button>
              {versionsSelectedBaseRevisionId &&
                versionsSelectedBaseRevisionId !== revision.revisionId && (
                  <Button
                    variant="neutral"
                    size="sm"
                    onClick={() => onVersionsDiffAgainstBase?.(revision)}
                  >
                    Diff vs base
                  </Button>
                )}
              {versionsBranches.find(
                (branch) =>
                  branch.name === (revision.branchName || revision.fossilBranch || 'trunk'),
              )?.policy !== 'owner_approval' && (
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={() => onVersionsOpenChangeReview?.(revision)}
                >
                  Open CR
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CheckpointsTabPanel(
  props: Omit<
    LeftSidebarProps,
    | 'onRefresh'
    | 'leftSidebarTab'
    | 'onTabChange'
    | 'scoreSummariesError'
    | 'scoreSummariesLoading'
    | 'scoreSummaries'
    | 'currentScoreId'
    | 'onOpenScoreFromSummary'
    | 'summarizeScoreId'
  >,
) {
  const {
    checkpointLabel,
    onCheckpointLabelChange,
    onSaveCheckpoint,
    checkpointSaveDisabled,
    scoreLoaded,
    checkpointError,
    checkpointLoading,
    checkpoints,
    checkpointControlsDisabled,
    checkpointCompareDisabled,
    onRestoreCheckpoint,
    onCompareCheckpoint,
    onRenameCheckpoint,
    onDeleteCheckpoint,
    scoreDirtySinceCheckpoint,
    formatTimestamp,
    formatBytes,
  } = props;

  return (
    <>
      <div className="mt-3 flex flex-col gap-2">
        <Input
          data-testid="input-checkpoint-label"
          value={checkpointLabel}
          onChange={(event) => onCheckpointLabelChange(event.target.value)}
          placeholder="Checkpoint label"
        />
        <Button
          variant={!checkpointSaveDisabled && scoreDirtySinceCheckpoint ? 'primary' : 'neutral'}
          size="md"
          data-testid="btn-checkpoint-save"
          onClick={onSaveCheckpoint}
          disabled={checkpointSaveDisabled}
          className="w-full"
        >
          Save Checkpoint
        </Button>
        {!scoreLoaded && (
          <span className="text-xs text-slate-500">Load a score to enable checkpoints.</span>
        )}
      </div>
      {checkpointError && <div className="mt-3 text-xs text-red-600">{checkpointError}</div>}
      {checkpointLoading && (
        <div className="mt-3 text-xs text-slate-500">Loading checkpoints...</div>
      )}
      {!checkpointLoading && checkpoints.length === 0 && (
        <div className="mt-3 text-xs text-slate-500">No checkpoints yet.</div>
      )}
      <div className="mt-3 space-y-3">
        {checkpoints.map((checkpoint) => (
          <div key={checkpoint.id} className="rounded border border-slate-200 p-2">
            <div className="text-sm font-medium text-slate-800">{checkpoint.title}</div>
            <div className="text-xs text-slate-500">
              {formatTimestamp(checkpoint.createdAt)}
              {checkpoint.size ? ` · ${formatBytes(checkpoint.size)}` : ''}
            </div>
            {(checkpoint.branchName || checkpoint.upstreamRevisionId || checkpoint.sourceId) && (
              <div className="mt-1 text-xs text-slate-500">
                {checkpoint.branchName ? `Branch ${checkpoint.branchName}` : ''}
                {checkpoint.branchName && checkpoint.upstreamRevisionId ? ' · ' : ''}
                {checkpoint.upstreamRevisionId ? `Revision ${checkpoint.upstreamRevisionId}` : ''}
                {(checkpoint.branchName || checkpoint.upstreamRevisionId) && checkpoint.sourceId
                  ? ' · '
                  : ''}
                {checkpoint.sourceId ? `Source ${checkpoint.sourceId}` : ''}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="neutral"
                size="sm"
                data-testid={`btn-checkpoint-restore-${checkpoint.id}`}
                onClick={() => onRestoreCheckpoint(checkpoint)}
                disabled={checkpointControlsDisabled}
              >
                Restore
              </Button>
              <Button
                variant="neutral"
                size="sm"
                data-testid={`btn-checkpoint-compare-${checkpoint.id}`}
                onClick={() => onCompareCheckpoint(checkpoint)}
                disabled={checkpointCompareDisabled}
              >
                Compare
              </Button>
              <Button
                variant="neutral"
                size="sm"
                data-testid={`btn-checkpoint-rename-${checkpoint.id}`}
                onClick={() => onRenameCheckpoint(checkpoint)}
                disabled={checkpointControlsDisabled}
              >
                Rename
              </Button>
              <Button
                variant="destructive"
                size="sm"
                data-testid={`btn-checkpoint-delete-${checkpoint.id}`}
                onClick={() => onDeleteCheckpoint(checkpoint)}
                disabled={checkpointControlsDisabled}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ScoresTabPanel(
  props: Pick<
    LeftSidebarProps,
    | 'scoreSummariesError'
    | 'scoreSummariesLoading'
    | 'scoreSummaries'
    | 'currentScoreId'
    | 'onOpenScoreFromSummary'
    | 'formatTimestamp'
    | 'summarizeScoreId'
  >,
) {
  const {
    scoreSummariesError,
    scoreSummariesLoading,
    scoreSummaries,
    currentScoreId,
    onOpenScoreFromSummary,
    formatTimestamp,
    summarizeScoreId,
  } = props;

  return (
    <>
      {scoreSummariesError && (
        <div className="mt-3 text-xs text-red-600">{scoreSummariesError}</div>
      )}
      {scoreSummariesLoading && (
        <div className="mt-3 text-xs text-slate-500">Loading scores...</div>
      )}
      {!scoreSummariesLoading && scoreSummaries.length === 0 && (
        <div className="mt-3 text-xs text-slate-500">No saved scores yet.</div>
      )}
      <div className="mt-3 space-y-3">
        {scoreSummaries.map((summary) => {
          const info = summarizeScoreId(summary.scoreId);
          const isCurrent = summary.scoreId === currentScoreId;
          return (
            <div
              key={summary.scoreId}
              className={`rounded border p-2 ${isCurrent ? 'border-accent/40 bg-accent-soft' : 'border-slate-200'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-800">{info.title}</div>
                {isCurrent && (
                  <span className="text-caption font-semibold uppercase text-ink-muted">
                    Current
                  </span>
                )}
              </div>
              {info.detail && <div className="text-xs text-slate-500 break-all">{info.detail}</div>}
              <div className="mt-1 text-xs text-slate-500">
                {summary.count} checkpoint{summary.count === 1 ? '' : 's'}
                {summary.lastUpdated ? ` · ${formatTimestamp(summary.lastUpdated)}` : ''}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="neutral" size="sm" onClick={() => onOpenScoreFromSummary(summary)}>
                  Open score
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** The History panel's content: tabs for OTS revisions, local checkpoints and scores. */
export function LeftSidebar(props: LeftSidebarProps) {
  const {
    onRefresh,
    checkpointControlsDisabled,
    leftSidebarTab,
    onTabChange,
    showVersionsTab = false,
  } = props;

  const content = (
    <div id="checkpoint-sidebar-content" className="px-4 pb-4">
      <div className="mt-3 flex gap-2 text-xs font-medium text-slate-600">
        {showVersionsTab && (
          <Button
            variant={leftSidebarTab === 'versions' ? 'neutral' : 'quiet'}
            data-testid="tab-versions"
            onClick={() => onTabChange('versions')}
          >
            OTS Revisions
          </Button>
        )}
        <Button
          variant={leftSidebarTab === 'checkpoints' ? 'neutral' : 'quiet'}
          data-testid="tab-checkpoints"
          onClick={() => onTabChange('checkpoints')}
        >
          Local Checkpoints
        </Button>
        <Button
          variant={leftSidebarTab === 'scores' ? 'neutral' : 'quiet'}
          data-testid="tab-scores"
          onClick={() => onTabChange('scores')}
        >
          Scores
        </Button>
      </div>
      {leftSidebarTab === 'versions' ? (
        <VersionsTabPanel
          versionsLoading={props.versionsLoading}
          versionsError={props.versionsError}
          versionsBranchName={props.versionsBranchName}
          versionsBranches={props.versionsBranches}
          versionsSelectedBranch={props.versionsSelectedBranch}
          versionsRevisions={props.versionsRevisions}
          versionsCanCreateBranch={props.versionsCanCreateBranch}
          versionsCanCommit={props.versionsCanCommit}
          versionsActionBusy={props.versionsActionBusy}
          versionsActionError={props.versionsActionError}
          versionsActionNotice={props.versionsActionNotice}
          versionsStatusMode={props.versionsStatusMode}
          versionsStatusMessage={props.versionsStatusMessage}
          versionsSelectedBaseRevisionId={props.versionsSelectedBaseRevisionId}
          versionsLoadBranchLabel={props.versionsLoadBranchLabel}
          versionsCommitMessage={props.versionsCommitMessage}
          onVersionsCommitMessageChange={props.onVersionsCommitMessageChange}
          onVersionsCommitCurrent={props.onVersionsCommitCurrent}
          versionsCreateBranchName={props.versionsCreateBranchName}
          onVersionsCreateBranchNameChange={props.onVersionsCreateBranchNameChange}
          versionsCreateBranchPolicy={props.versionsCreateBranchPolicy}
          onVersionsCreateBranchPolicyChange={props.onVersionsCreateBranchPolicyChange}
          onVersionsCreateBranch={props.onVersionsCreateBranch}
          onVersionsBranchChange={props.onVersionsBranchChange}
          onVersionsRefresh={props.onVersionsRefresh}
          onVersionsOpenRevision={props.onVersionsOpenRevision}
          onVersionsDiffRevision={props.onVersionsDiffRevision}
          onVersionsSelectBaseRevision={props.onVersionsSelectBaseRevision}
          onVersionsDiffAgainstBase={props.onVersionsDiffAgainstBase}
          onVersionsLoadBranchHead={props.onVersionsLoadBranchHead}
          onVersionsOpenChangeReview={props.onVersionsOpenChangeReview}
        />
      ) : leftSidebarTab === 'checkpoints' ? (
        <CheckpointsTabPanel {...props} />
      ) : (
        <ScoresTabPanel
          scoreSummariesError={props.scoreSummariesError}
          scoreSummariesLoading={props.scoreSummariesLoading}
          scoreSummaries={props.scoreSummaries}
          currentScoreId={props.currentScoreId}
          onOpenScoreFromSummary={props.onOpenScoreFromSummary}
          formatTimestamp={props.formatTimestamp}
          summarizeScoreId={props.summarizeScoreId}
        />
      )}
    </div>
  );

  return (
    <div data-testid="checkpoint-sidebar" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex justify-end px-4 pt-3">
        <Button
          variant="quiet"
          data-testid="btn-checkpoint-refresh"
          onClick={onRefresh}
          disabled={checkpointControlsDisabled}
        >
          Refresh
        </Button>
      </div>
      {content}
    </div>
  );
}
