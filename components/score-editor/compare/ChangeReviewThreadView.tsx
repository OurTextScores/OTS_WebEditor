import React from 'react';
import { fetchJsonOrThrow } from '../../../lib/fetch-json';
import type { ChangeReviewThread } from './compare-types';

type Props = {
  thread: ChangeReviewThread;
  changeReviewId: string;
  canResolve: boolean;
  canReply: boolean;
  /** Only the viewer's own comments can be deleted. */
  viewerUserId: string | undefined;
  actionBusy: boolean;
  replyThreadId: string | null;
  replyContent: string;
  setReplyThreadId: (threadId: string | null) => void;
  setReplyContent: (content: string) => void;
  runAction: (action: () => Promise<void>) => Promise<unknown> | void;
};

/** One change-review comment thread: its status, its comments, and resolve, delete and reply. */
export function ChangeReviewThreadView({
  thread,
  changeReviewId,
  canResolve,
  canReply,
  viewerUserId,
  actionBusy,
  replyThreadId,
  replyContent,
  setReplyThreadId,
  setReplyContent,
  runAction,
}: Props) {
  return (
    <div className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-caption text-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded px-1 py-0.5 text-caption font-semibold uppercase tracking-wide ${
            thread.status === 'open'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {thread.status}
        </span>
        {canResolve && (
          <button
            type="button"
            disabled={actionBusy}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-caption text-slate-700 disabled:opacity-50"
            onClick={() =>
              void runAction(async () => {
                await fetchJsonOrThrow(
                  `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/threads/${encodeURIComponent(thread.threadId)}`,
                  {
                    method: 'PATCH',
                    body: JSON.stringify({
                      status: thread.status === 'open' ? 'resolved' : 'open',
                    }),
                  },
                );
              })
            }
          >
            {thread.status === 'open' ? 'Resolve' : 'Reopen'}
          </button>
        )}
      </div>
      <div className="grid gap-2">
        {thread.comments.map((comment) => (
          <div
            key={comment.commentId}
            className="rounded border border-slate-200 bg-white px-2 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-caption text-slate-500">
                {comment.username || comment.userId} ·{' '}
                {new Date(comment.createdAt).toLocaleString()}
                {comment.editedAt ? ' · edited' : ''}
              </div>
              {viewerUserId === comment.userId && (
                <button
                  type="button"
                  disabled={actionBusy}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-caption text-slate-700 disabled:opacity-50"
                  onClick={() =>
                    void runAction(async () => {
                      await fetchJsonOrThrow(
                        `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/comments/${encodeURIComponent(comment.commentId)}`,
                        {
                          method: 'DELETE',
                        },
                      );
                    })
                  }
                >
                  Delete
                </button>
              )}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-caption text-slate-800">
              {comment.content}
            </div>
          </div>
        ))}
      </div>
      {canReply && (
        <div className="grid gap-2">
          {replyThreadId === thread.threadId ? (
            <>
              <textarea
                value={replyContent}
                onChange={(event) => setReplyContent(event.target.value)}
                rows={3}
                placeholder="Write a reply"
                className="min-h-[72px] w-full rounded border border-slate-300 bg-white px-2 py-1 text-caption text-slate-900 placeholder-slate-400"
                disabled={actionBusy}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-caption text-slate-700 disabled:opacity-50"
                  onClick={() => {
                    setReplyThreadId(null);
                    setReplyContent('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-caption text-sky-700 disabled:opacity-50"
                  onClick={() =>
                    void runAction(async () => {
                      await fetchJsonOrThrow(
                        `/api/proxy/change-reviews/${encodeURIComponent(changeReviewId)}/threads/${encodeURIComponent(thread.threadId)}/comments`,
                        {
                          method: 'POST',
                          body: JSON.stringify({ content: replyContent }),
                        },
                      );
                      setReplyThreadId(null);
                      setReplyContent('');
                    })
                  }
                >
                  Reply
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={actionBusy}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-caption text-slate-700 disabled:opacity-50"
                onClick={() => {
                  setReplyThreadId(thread.threadId);
                  setReplyContent('');
                }}
              >
                Reply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
