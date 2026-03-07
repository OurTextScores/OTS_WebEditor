import React from 'react';
import type { CheckpointSummary, ScoreSummary } from '../../lib/checkpoints';
import type { SourceHistoryBranch, SourceHistoryRevision } from '../../lib/ourtextscores-api-client';

export type LeftSidebarTab = 'versions' | 'checkpoints' | 'scores';

type ScoreIdSummary = {
    title: string;
    detail: string;
    type: 'url' | 'file' | 'new' | 'legacy' | 'other';
};

type LeftSidebarProps = {
    hidden?: boolean;
    collapsed: boolean;
    onToggleCollapsed: () => void;
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

function VersionsTabPanel(props: Pick<LeftSidebarProps,
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
>) {
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
        ? versionsRevisions.find((revision) => revision.revisionId === versionsSelectedBaseRevisionId) ?? null
        : null;
    const versionsStatusStyle = versionsStatusMode === 'detached'
        ? { borderColor: '#b45309', backgroundColor: '#fde68a', color: '#451a03' }
        : { borderColor: '#047857', backgroundColor: '#bbf7d0', color: '#052e16' };

    return (
        <>
            <div className="mt-3 flex items-center gap-2">
                <select
                    value={versionsBranchName}
                    onChange={(event) => onVersionsBranchChange?.(event.target.value)}
                    className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                >
                    {versionsBranches.map((branch) => (
                        <option key={branch.name} value={branch.name}>
                            {branch.name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={onVersionsRefresh}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                    Refresh
                </button>
            </div>
            {versionsSelectedBranch && (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-600">
                    <div className="font-medium text-gray-800">
                        {versionsSelectedBranch.policy === 'owner_approval' ? 'Owner approval required' : 'Open branch'}
                    </div>
                    <div>
                        {versionsSelectedBranch.commitCount} commit{versionsSelectedBranch.commitCount === 1 ? '' : 's'}
                    </div>
                    {versionsSelectedBranch.empty && versionsSelectedBranch.baseRevisionId && (
                        <div>Based on {versionsSelectedBranch.baseRevisionId}</div>
                    )}
                    <button
                        type="button"
                        onClick={onVersionsLoadBranchHead}
                        disabled={versionsActionBusy}
                        className="mt-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                        {versionsActionBusy ? 'Working...' : versionsLoadBranchLabel}
                    </button>
                </div>
            )}
            {versionsStatusMessage && (
                <div
                    className="mt-3 rounded border px-2 py-2 text-sm font-semibold shadow-sm"
                    style={versionsStatusStyle}
                >
                    {versionsStatusMessage}
                </div>
            )}
            {versionsSelectedBaseRevisionId && (
                <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-2 py-2 text-xs text-blue-900">
                    Base revision selected for diff: {selectedBaseRevision ? `#${selectedBaseRevision.sequenceNumber}` : versionsSelectedBaseRevisionId}
                </div>
            )}
            <div className="mt-3 rounded border border-gray-200 p-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Commit Current Score
                </div>
                <textarea
                    value={versionsCommitMessage}
                    onChange={(event) => onVersionsCommitMessageChange?.(event.target.value)}
                    placeholder="Commit message"
                    rows={3}
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                    type="button"
                    onClick={onVersionsCommitCurrent}
                    disabled={versionsActionBusy || !versionsCanCommit}
                    className="mt-2 w-full rounded border border-blue-600 bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500"
                >
                    {versionsActionBusy ? 'Working...' : 'Commit current score'}
                </button>
                {!versionsCanCommit && (
                    <div className="mt-2 text-xs text-gray-500">
                        Sign in with commit access to create a server revision.
                    </div>
                )}
            </div>
            <div className="mt-3 rounded border border-gray-200 p-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Create Branch
                </div>
                <input
                    type="text"
                    value={versionsCreateBranchName}
                    onChange={(event) => onVersionsCreateBranchNameChange?.(event.target.value)}
                    placeholder="new-branch"
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <select
                    value={versionsCreateBranchPolicy}
                    onChange={(event) => onVersionsCreateBranchPolicyChange?.(event.target.value as 'public' | 'owner_approval')}
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
                >
                    <option value="public">Open</option>
                    <option value="owner_approval">Owner approval required</option>
                </select>
                <button
                    type="button"
                    onClick={onVersionsCreateBranch}
                    disabled={versionsActionBusy || !versionsCanCreateBranch || !versionsCreateBranchName.trim()}
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                    {versionsActionBusy ? 'Working...' : 'Create branch'}
                </button>
                {!versionsCanCreateBranch && (
                    <div className="mt-2 text-xs text-gray-500">
                        Sign in to create a branch.
                    </div>
                )}
            </div>
            {versionsError && (
                <div className="mt-3 text-xs text-red-600">
                    {versionsError}
                </div>
            )}
            {versionsActionError && (
                <div className="mt-3 text-xs text-red-600">
                    {versionsActionError}
                </div>
            )}
            {versionsActionNotice && (
                <div className="mt-3 text-xs text-green-700">
                    {versionsActionNotice}
                </div>
            )}
            {versionsLoading && (
                <div className="mt-3 text-xs text-gray-400">
                    Loading versions...
                </div>
            )}
            {!versionsLoading && versionsRevisions.length === 0 && (
                <div className="mt-3 text-xs text-gray-400">
                    No revisions on this branch yet.
                </div>
            )}
            <div className="mt-3 space-y-3">
                {versionsRevisions.map((revision) => (
                    <div
                        key={revision.revisionId}
                        className={`rounded border p-2 ${versionsSelectedBaseRevisionId === revision.revisionId ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-800">
                                #{revision.sequenceNumber}
                            </div>
                            {revision.isBranchHead && (
                                <span className="text-[10px] font-semibold uppercase text-blue-700">
                                    Head
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500">
                            {revision.changeSummary || 'No change summary'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                            {new Date(revision.createdAt).toLocaleString()}
                            {revision.createdByUsername ? ` · ${revision.createdByUsername}` : ''}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => onVersionsOpenRevision?.(revision)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Open
                            </button>
                            <button
                                type="button"
                                onClick={() => onVersionsDiffRevision?.(revision)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Diff vs current
                            </button>
                            <button
                                type="button"
                                onClick={() => onVersionsSelectBaseRevision?.(versionsSelectedBaseRevisionId === revision.revisionId ? null : revision)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                {versionsSelectedBaseRevisionId === revision.revisionId ? 'Clear base' : 'Set base'}
                            </button>
                            {versionsSelectedBaseRevisionId && versionsSelectedBaseRevisionId !== revision.revisionId && (
                                <button
                                    type="button"
                                    onClick={() => onVersionsDiffAgainstBase?.(revision)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    Diff vs base
                                </button>
                            )}
                            {versionsBranches.find((branch) => branch.name === (revision.branchName || revision.fossilBranch || 'trunk'))?.policy !== 'owner_approval' && (
                                <button
                                    type="button"
                                    onClick={() => onVersionsOpenChangeReview?.(revision)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    Open CR
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function CheckpointsTabPanel(props: Omit<LeftSidebarProps, 'hidden' | 'collapsed' | 'onToggleCollapsed' | 'onRefresh' | 'leftSidebarTab' | 'onTabChange' | 'scoreSummariesError' | 'scoreSummariesLoading' | 'scoreSummaries' | 'currentScoreId' | 'onOpenScoreFromSummary' | 'summarizeScoreId'>) {
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
        onDeleteCheckpoint,
        scoreDirtySinceCheckpoint,
        formatTimestamp,
        formatBytes,
    } = props;

    return (
        <>
            <div className="mt-3 flex flex-col gap-2">
                <input
                    data-testid="input-checkpoint-label"
                    type="text"
                    value={checkpointLabel}
                    onChange={(event) => onCheckpointLabelChange(event.target.value)}
                    placeholder="Checkpoint label"
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                    type="button"
                    data-testid="btn-checkpoint-save"
                    onClick={onSaveCheckpoint}
                    disabled={checkpointSaveDisabled}
                    className={`w-full rounded border px-3 py-1 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                        !checkpointSaveDisabled && scoreDirtySinceCheckpoint
                            ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    Save Checkpoint
                </button>
                {!scoreLoaded && (
                    <span className="text-xs text-gray-400">
                        Load a score to enable checkpoints.
                    </span>
                )}
            </div>
            {checkpointError && (
                <div className="mt-3 text-xs text-red-600">
                    {checkpointError}
                </div>
            )}
            {checkpointLoading && (
                <div className="mt-3 text-xs text-gray-400">
                    Loading checkpoints...
                </div>
            )}
            {!checkpointLoading && checkpoints.length === 0 && (
                <div className="mt-3 text-xs text-gray-400">
                    No checkpoints yet.
                </div>
            )}
            <div className="mt-3 space-y-3">
                {checkpoints.map((checkpoint) => (
                    <div
                        key={checkpoint.id}
                        className="rounded border border-gray-200 p-2"
                    >
                        <div className="text-sm font-medium text-gray-800">
                            {checkpoint.title}
                        </div>
                        <div className="text-xs text-gray-500">
                            {formatTimestamp(checkpoint.createdAt)}
                            {checkpoint.size ? ` · ${formatBytes(checkpoint.size)}` : ''}
                        </div>
                        {(checkpoint.branchName || checkpoint.upstreamRevisionId || checkpoint.sourceId) && (
                            <div className="mt-1 text-xs text-gray-500">
                                {checkpoint.branchName ? `Branch ${checkpoint.branchName}` : ''}
                                {checkpoint.branchName && checkpoint.upstreamRevisionId ? ' · ' : ''}
                                {checkpoint.upstreamRevisionId ? `Revision ${checkpoint.upstreamRevisionId}` : ''}
                                {(checkpoint.branchName || checkpoint.upstreamRevisionId) && checkpoint.sourceId ? ' · ' : ''}
                                {checkpoint.sourceId ? `Source ${checkpoint.sourceId}` : ''}
                            </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-testid={`btn-checkpoint-restore-${checkpoint.id}`}
                                onClick={() => onRestoreCheckpoint(checkpoint)}
                                disabled={checkpointControlsDisabled}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Restore
                            </button>
                            <button
                                type="button"
                                data-testid={`btn-checkpoint-compare-${checkpoint.id}`}
                                onClick={() => onCompareCheckpoint(checkpoint)}
                                disabled={checkpointCompareDisabled}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Compare
                            </button>
                            <button
                                type="button"
                                data-testid={`btn-checkpoint-delete-${checkpoint.id}`}
                                onClick={() => onDeleteCheckpoint(checkpoint)}
                                disabled={checkpointControlsDisabled}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function ScoresTabPanel(props: Pick<LeftSidebarProps, 'scoreSummariesError' | 'scoreSummariesLoading' | 'scoreSummaries' | 'currentScoreId' | 'onOpenScoreFromSummary' | 'formatTimestamp' | 'summarizeScoreId'>) {
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
                <div className="mt-3 text-xs text-red-600">
                    {scoreSummariesError}
                </div>
            )}
            {scoreSummariesLoading && (
                <div className="mt-3 text-xs text-gray-400">
                    Loading scores...
                </div>
            )}
            {!scoreSummariesLoading && scoreSummaries.length === 0 && (
                <div className="mt-3 text-xs text-gray-400">
                    No saved scores yet.
                </div>
            )}
            <div className="mt-3 space-y-3">
                {scoreSummaries.map((summary) => {
                    const info = summarizeScoreId(summary.scoreId);
                    const isCurrent = summary.scoreId === currentScoreId;
                    return (
                        <div
                            key={summary.scoreId}
                            className={`rounded border p-2 ${isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-gray-800">
                                    {info.title}
                                </div>
                                {isCurrent && (
                                    <span className="text-[10px] font-semibold uppercase text-blue-700">
                                        Current
                                    </span>
                                )}
                            </div>
                            {info.detail && (
                                <div className="text-xs text-gray-500 break-all">
                                    {info.detail}
                                </div>
                            )}
                            <div className="mt-1 text-xs text-gray-500">
                                {summary.count} checkpoint{summary.count === 1 ? '' : 's'}
                                {summary.lastUpdated ? ` · ${formatTimestamp(summary.lastUpdated)}` : ''}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => onOpenScoreFromSummary(summary)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    Open score
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

export function LeftSidebar(props: LeftSidebarProps) {
    const {
        hidden = false,
        collapsed,
        onToggleCollapsed,
        onRefresh,
        checkpointControlsDisabled,
        leftSidebarTab,
        onTabChange,
        showVersionsTab = false,
    } = props;

    if (hidden) {
        return null;
    }

    return (
        <aside
            className={`shrink-0 border-r bg-white text-sm ${collapsed ? 'w-12' : 'w-72 overflow-y-auto'}`}
            data-testid="checkpoint-sidebar"
        >
            <div className={collapsed ? 'flex items-center justify-center p-2' : 'flex items-center justify-between p-4'}>
                {!collapsed && (
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        History
                    </span>
                )}
                <div className={collapsed ? '' : 'flex items-center gap-2'}>
                    {!collapsed && (
                        <button
                            type="button"
                            data-testid="btn-checkpoint-refresh"
                            onClick={onRefresh}
                            disabled={checkpointControlsDisabled}
                            className="text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Refresh
                        </button>
                    )}
                    <button
                        type="button"
                        data-testid="btn-checkpoint-toggle"
                        aria-expanded={!collapsed}
                        aria-controls="checkpoint-sidebar-content"
                        aria-label={collapsed ? 'Show checkpoints' : 'Hide checkpoints'}
                        onClick={onToggleCollapsed}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900"
                    >
                        {collapsed ? '>>' : '<<'}
                    </button>
                </div>
            </div>
            {!collapsed && (
                <div id="checkpoint-sidebar-content" className="px-4 pb-4">
                    <div className="mt-3 flex gap-2 text-xs font-medium text-gray-600">
                        {showVersionsTab && (
                            <button
                                type="button"
                                data-testid="tab-versions"
                                onClick={() => onTabChange('versions')}
                                className={`rounded border px-2 py-1 ${
                                    leftSidebarTab === 'versions'
                                        ? 'border-gray-400 bg-gray-100 text-gray-900'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                OTS Revisions
                            </button>
                        )}
                        <button
                            type="button"
                            data-testid="tab-checkpoints"
                            onClick={() => onTabChange('checkpoints')}
                                className={`rounded border px-2 py-1 ${
                                    leftSidebarTab === 'checkpoints'
                                        ? 'border-gray-400 bg-gray-100 text-gray-900'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                            Local Checkpoints
                        </button>
                        <button
                            type="button"
                            data-testid="tab-scores"
                            onClick={() => onTabChange('scores')}
                            className={`rounded border px-2 py-1 ${
                                leftSidebarTab === 'scores'
                                    ? 'border-gray-400 bg-gray-100 text-gray-900'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Scores
                        </button>
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
            )}
        </aside>
    );
}
