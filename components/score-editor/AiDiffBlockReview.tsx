'use client';

export type AiDiffBlockReviewStatus = 'pending' | 'accepted' | 'rejected' | 'comment';

export function AiDiffBlockReview({
  review,
  disabled,
  actions,
  bindTextarea,
  onTextareaInput,
  resizeTextarea,
}: {
  review: {
    status: AiDiffBlockReviewStatus;
    comment: string;
    commentCommitted: boolean;
    error: string;
  };
  disabled: {
    apply: boolean;
    feedback: boolean;
  };
  actions: {
    apply: () => void;
    reject: () => void;
    comment: () => void;
    commitComment: () => void;
    editComment: () => void;
  };
  bindTextarea: (element: HTMLTextAreaElement | null) => void;
  onTextareaInput: () => void;
  resizeTextarea: (element: HTMLTextAreaElement) => void;
}) {
  const { status, comment, commentCommitted, error } = review;
  const resizeWhileDragging = (
    event: React.MouseEvent<HTMLTextAreaElement> | React.PointerEvent<HTMLTextAreaElement>,
  ) => {
    if (event.buttons === 1) {
      resizeTextarea(event.currentTarget);
    }
  };

  return (
    <div className="mt-1 grid gap-1">
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          disabled={disabled.apply}
          className={`h-6 rounded border text-[10px] ${
            status === 'accepted'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-gray-100 text-gray-600'
          } disabled:opacity-50`}
          onClick={actions.apply}
        >
          Apply
        </button>
        <button
          type="button"
          disabled={disabled.feedback}
          className={`h-6 rounded border text-[10px] ${
            status === 'rejected'
              ? 'border-rose-400 bg-rose-50 text-rose-700'
              : 'border-gray-200 bg-gray-100 text-gray-600'
          } disabled:opacity-50`}
          onClick={actions.reject}
        >
          Reject
        </button>
        <button
          type="button"
          disabled={disabled.feedback}
          className={`h-6 rounded border text-[10px] ${
            status === 'comment'
              ? 'border-sky-400 bg-sky-50 text-sky-700'
              : 'border-gray-200 bg-gray-100 text-gray-600'
          } disabled:opacity-50`}
          onClick={actions.comment}
        >
          Comment
        </button>
      </div>
      {status === 'comment' && (
        <>
          {!commentCommitted && (
            <>
              <textarea
                ref={bindTextarea}
                defaultValue={comment}
                onChange={onTextareaInput}
                onPointerUp={(event) => resizeTextarea(event.currentTarget)}
                onPointerMove={resizeWhileDragging}
                onMouseUp={(event) => resizeTextarea(event.currentTarget)}
                onMouseMove={resizeWhileDragging}
                placeholder="Describe the revision needed..."
                className="min-h-[84px] min-w-[220px] w-full max-w-none resize rounded border border-sky-300 bg-white px-2 py-1 text-[10px] text-gray-900 placeholder-gray-400"
                disabled={disabled.feedback}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={disabled.feedback}
                  className="h-6 rounded border border-sky-300 bg-sky-50 px-2 text-[10px] text-sky-700 disabled:opacity-50"
                  onClick={actions.commitComment}
                >
                  Enter
                </button>
              </div>
            </>
          )}
          {commentCommitted && (
            <div className="grid gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-1">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                Comment attached
              </div>
              <div className="whitespace-pre-wrap text-[10px] text-sky-900">{comment}</div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={disabled.feedback}
                  className="h-6 rounded border border-sky-300 bg-white px-2 text-[10px] text-sky-700 disabled:opacity-50"
                  onClick={actions.editComment}
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <div className="text-[9px] text-rose-600">{error}</div>}
    </div>
  );
}
