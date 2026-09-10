'use client';

import {
  AI_EDIT_EFFORT_PROFILES,
  AI_EDIT_EFFORTS,
  formatAiEditBudgetDuration,
  type AiEditEffort,
} from '../../lib/ai-edit-effort';
import { type AiProposalController } from './useAiProposalController';

const VERIFICATION_LABELS: Record<string, string> = {
  patch_apply: 'apply-verified',
  tool_execution: 'tool-executed',
  engine_load: 'engine-verified',
  render: 'render-verified',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export function AiCompareWorkspaceActions({
  applyBusy,
  feedbackBusy,
  canSendFeedback,
  feedbackLabel,
  onApplyAll,
  onSendFeedback,
}: {
  applyBusy: boolean;
  feedbackBusy: boolean;
  canSendFeedback: boolean;
  feedbackLabel: string;
  onApplyAll: () => void;
  onSendFeedback: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onApplyAll}
        disabled={applyBusy || feedbackBusy}
        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Apply All AI Changes
      </button>
      <button
        type="button"
        onClick={onSendFeedback}
        disabled={!canSendFeedback}
        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {feedbackBusy ? 'Sending...' : feedbackLabel}
      </button>
    </>
  );
}

export function AiCompareWorkspace({
  proposalController,
  embedded,
  feedbackBusy,
  globalComment,
  iteration,
  feedbackError,
  onGlobalCommentChange,
  onRebase,
  rebaseBusy = false,
}: {
  proposalController: AiProposalController;
  embedded: boolean;
  feedbackBusy: boolean;
  globalComment: string;
  iteration: number;
  feedbackError: string | null;
  onGlobalCommentChange: (value: string) => void;
  onRebase?: (() => void) | null;
  rebaseBusy?: boolean;
}) {
  const { applyError, audit } = proposalController;
  const auditVerification = asRecord(audit?.verification);
  const auditBudget = asRecord(auditVerification?.budget);
  const contextFlags = asRecord(audit?.proposalContext);
  const truncatedFields = Array.isArray(contextFlags?.truncated)
    ? contextFlags.truncated.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const deepAudit = asRecord(audit?.deepEdit);
  const deepCandidates = Array.isArray(deepAudit?.candidates) ? deepAudit.candidates.length : 0;
  const deepRationale = typeof deepAudit?.rationale === 'string' ? deepAudit.rationale.trim() : '';
  const auditEffort =
    typeof auditVerification?.effort === 'string' &&
    AI_EDIT_EFFORTS.includes(auditVerification.effort as AiEditEffort)
      ? (auditVerification.effort as AiEditEffort)
      : null;
  const statusParts = audit
    ? [
        typeof audit.cycle === 'number' ? `Cycle ${audit.cycle}` : '',
        typeof auditVerification?.level === 'string'
          ? (VERIFICATION_LABELS[auditVerification.level] ?? '')
          : '',
        auditEffort ? `${AI_EDIT_EFFORT_PROFILES[auditEffort].label} effort` : '',
        typeof auditBudget?.budgetMs === 'number'
          ? `${formatAiEditBudgetDuration(auditBudget.budgetMs)} budget`
          : '',
        typeof auditVerification?.attempts === 'number'
          ? `${auditVerification.attempts} attempt${auditVerification.attempts === 1 ? '' : 's'}`
          : '',
        typeof auditVerification?.llmCalls === 'number'
          ? `${auditVerification.llmCalls} LLM call${auditVerification.llmCalls === 1 ? '' : 's'}`
          : '',
        deepAudit && deepCandidates
          ? `${deepCandidates} candidate${deepCandidates === 1 ? '' : 's'}`
          : '',
      ].filter(Boolean)
    : [];
  const contextWarning =
    contextFlags?.previousCycleDropped === true
      ? 'The score changed outside this proposal, so the previous cycle was not shown to the model.'
      : truncatedFields.length
        ? `Some session context was shortened to fit limits (${truncatedFields.join(', ')}).`
        : '';

  return (
    <>
      {applyError && (
        <div
          role="alert"
          className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700"
        >
          <span>{applyError}</span>
          {onRebase && (
            <span className="mt-1 block">
              Rebasing refreshes the left side to the current score so you can review the updated
              differences and apply this proposal.
              <button
                type="button"
                data-testid="btn-rebase-proposal"
                onClick={onRebase}
                disabled={rebaseBusy}
                className="ml-2 rounded border border-rose-400 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                {rebaseBusy ? 'Rebasing...' : 'Rebase onto current score'}
              </button>
            </span>
          )}
        </div>
      )}
      {audit && (
        <div
          data-testid="ai-proposal-audit"
          className="rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600"
        >
          <span>{statusParts.join(' · ')}</span>
          {contextWarning && <span className="ml-2 text-amber-700">{contextWarning}</span>}
          {deepRationale && (
            <details className="mt-1">
              <summary className="cursor-pointer text-gray-500">Deep Edit rationale</summary>
              <div className="mt-1 whitespace-pre-wrap text-gray-600">{deepRationale}</div>
            </details>
          )}
        </div>
      )}
      {!embedded && (
        <div className="rounded border border-gray-300 bg-gray-100 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-900">
            Global Feedback for Next AI Iteration
          </div>
          <div className="mt-1 text-[11px] text-gray-700">
            Optional. Use this for overall guidance that applies across multiple diff blocks.
          </div>
          <textarea
            value={globalComment}
            onChange={(event) => onGlobalCommentChange(event.target.value)}
            placeholder="Overall feedback for the next revision..."
            className="mt-2 min-h-[56px] w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-500"
            disabled={feedbackBusy}
          />
          <div className="mt-2 text-[11px] text-gray-700">Iteration {iteration + 1} review</div>
          {feedbackError && (
            <div className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
              Last feedback request failed: {feedbackError}
            </div>
          )}
        </div>
      )}
    </>
  );
}
