import type { ReactNode, RefObject } from 'react';
import type { Positions } from '@/lib/webmscore-loader';
import type {
  ChangeReviewBar,
  ChangeReviewDetail,
  ChangeReviewScoreView,
  ChangeReviewThread,
} from './compare/compare-types';

/** A bar placed against the rendered score, in engraving coordinates. */
export type ChangeReviewBarBox = {
  bar: ChangeReviewBar;
  top: number;
};

/**
 * The review gutter for single-revision change reviews, where there is one score
 * rather than two panes. Its bars are positioned against that score's measures.
 *
 * Presentational: it renders bars, threads and the new-thread form, and calls back.
 * Thread creation goes through the owner's `createThread` action -- the same boundary
 * CompareDiffGutter was given -- so the review endpoint is named in one place.
 */
export type ChangeReviewScorePanelProps = {
  review: {
    detail: ChangeReviewDetail | null;
    /** Already filtered to focused-or-threaded bars and sorted by position. */
    barBoxes: ChangeReviewBarBox[];
    threadsByAnchor: Map<string, ChangeReviewThread>;
    focusedAnchorId: string | null;
    newThreadAnchorId: string | null;
    newThreadContent: string;
    loading: boolean;
    error: string | null;
    actionBusy: boolean;
    actionError: string | null;
    measurePositions: Positions | null;
    scoreView: ChangeReviewScoreView | null;
    renderThread: (thread: ChangeReviewThread) => ReactNode;
    createThread: (anchorId: string, content: string) => Promise<void>;
    setFocusedAnchorId: (value: string | null) => void;
    setNewThreadAnchorId: (value: string | null) => void;
    setNewThreadContent: (value: string) => void;
  };
  /**
   * Own prop, not a member of `review`: react-hooks/refs treats reading any field of
   * an object that holds a ref as a render-time ref access.
   */
  gutterRef: RefObject<HTMLDivElement | null>;
  /** Label for the reviewed revision, from the embed URL. */
  reviewLabel: string;
  /** Current score zoom; bar boxes are positioned in engraving coordinates. */
  zoom: number;
};

export function ChangeReviewScorePanel({
  review,
  gutterRef,
  reviewLabel,
  zoom,
}: ChangeReviewScorePanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const changeReviewDetail = review.detail;
  const changeReviewGutterBars = review.barBoxes;
  const changeReviewThreadsByAnchor = review.threadsByAnchor;
  const changeReviewFocusedAnchorId = review.focusedAnchorId;
  const changeReviewNewThreadAnchorId = review.newThreadAnchorId;
  const changeReviewNewThreadContent = review.newThreadContent;
  const changeReviewLoading = review.loading;
  const changeReviewError = review.error;
  const changeReviewActionBusy = review.actionBusy;
  const changeReviewActionError = review.actionError;
  const changeReviewMeasurePositions = review.measurePositions;
  const changeReviewScoreView = review.scoreView;
  const renderChangeReviewThread = review.renderThread;
  const setChangeReviewFocusedAnchorId = review.setFocusedAnchorId;
  const setChangeReviewNewThreadAnchorId = review.setNewThreadAnchorId;
  const setChangeReviewNewThreadContent = review.setNewThreadContent;

  return (
    <aside
      ref={gutterRef}
      className="relative w-80 shrink-0 overflow-hidden border-l border-slate-200 bg-slate-50"
      data-testid="change-review-gutter"
    >
      <div className="sticky top-0 z-[60] border-b border-slate-200 bg-white px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {reviewLabel}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">Select any bar to leave a comment.</div>
        {changeReviewLoading && (
          <div className="mt-1 text-[10px] text-slate-500">Loading review...</div>
        )}
        {(changeReviewError || changeReviewActionError) && (
          <div className="mt-1 text-[10px] text-rose-700">
            {changeReviewError || changeReviewActionError}
          </div>
        )}
      </div>
      <div
        className="relative min-h-full"
        style={{
          height: `${Math.max(900, (changeReviewMeasurePositions?.pageSize?.height || 900) * zoom + 160)}px`,
        }}
      >
        {changeReviewGutterBars.map(({ bar, top }) => {
          const thread = changeReviewThreadsByAnchor.get(bar.anchorId);
          const selected = changeReviewFocusedAnchorId === bar.anchorId;
          return (
            <div
              key={`gutter-${bar.anchorId}`}
              className={`absolute left-2 right-2 rounded border bg-white p-2 text-xs shadow-sm ${selected ? 'z-50 border-sky-400 ring-2 ring-sky-300' : 'z-10 border-slate-300'}`}
              style={{ top: `${64 + top * zoom}px` }}
              onClick={() => setChangeReviewFocusedAnchorId(bar.anchorId)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{bar.label}</span>
                {bar.changeType && (
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] uppercase ${bar.changeType === 'added' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                  >
                    {bar.changeType}
                  </span>
                )}
              </div>
              {selected && bar.summary && (
                <div className="mt-1 text-[10px] text-slate-500">{bar.summary}</div>
              )}
              {!thread && selected && changeReviewDetail?.permissions.canAddThread && (
                <div className="mt-2 grid gap-2">
                  {changeReviewNewThreadAnchorId === bar.anchorId ? (
                    <>
                      <label
                        className="font-semibold text-slate-800"
                        htmlFor={`change-review-comment-${bar.anchorId}`}
                      >
                        Write a comment on this bar.
                      </label>
                      <textarea
                        id={`change-review-comment-${bar.anchorId}`}
                        autoFocus
                        value={changeReviewNewThreadContent}
                        onChange={(event) => setChangeReviewNewThreadContent(event.target.value)}
                        rows={4}
                        placeholder="Enter your review comment"
                        className="w-full rounded border border-sky-400 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-600"
                        disabled={changeReviewActionBusy}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={changeReviewActionBusy}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            setChangeReviewNewThreadAnchorId(null);
                            setChangeReviewNewThreadContent('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={changeReviewActionBusy || !changeReviewNewThreadContent.trim()}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            void review.createThread(bar.anchorId, changeReviewNewThreadContent);
                          }}
                        >
                          Submit
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={changeReviewActionBusy}
                      className="rounded border border-sky-400 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 disabled:opacity-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        setChangeReviewNewThreadAnchorId(bar.anchorId);
                        setChangeReviewNewThreadContent('');
                      }}
                    >
                      Add Thread
                    </button>
                  )}
                </div>
              )}
              {thread && (selected || thread.status === 'open') && renderChangeReviewThread(thread)}
              {thread && !selected && thread.status === 'resolved' && (
                <div className="mt-1 text-[10px] text-emerald-700">
                  Resolved · {thread.comments.length} comment
                  {thread.comments.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
          );
        })}
        {changeReviewScoreView?.removedRegions.map((region, index) => {
          const thread = changeReviewThreadsByAnchor.get(region.anchorId);
          return (
            <div
              key={region.anchorId}
              className="absolute bottom-2 left-2 right-2 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800"
              style={{ transform: `translateY(${-index * 52}px)` }}
            >
              <div className="font-semibold">{region.label}</div>
              <div className="text-[10px]">Removed from the head score</div>
              {thread && renderChangeReviewThread(thread)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
