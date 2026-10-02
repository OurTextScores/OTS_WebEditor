/**
 * Measure-level discussion threads on the compare diff (ephemeral, in-session).
 *
 * Presentational: it renders the focused anchor's thread, the draft box, and the list of
 * other threads, and routes every action back to the caller. It never touches WASM and
 * never infers a score role from a visual side — anchors carry their own part/measure
 * identity and a side-independent key.
 */
export type AiThreadComment = {
  id: string;
  author: 'you' | 'assistant';
  text: string;
  createdAt: string;
};

export type AiMeasureAnchor = {
  key: string;
  partIndex: number;
  measureNumber: number;
  leftIndex: number | null;
  rightIndex: number | null;
};

export type AiMeasureThread = AiMeasureAnchor & {
  comments: AiThreadComment[];
};

export type CompareMeasureCommentsModel = {
  threads: Record<string, AiMeasureThread>;
  focusedAnchor: AiMeasureAnchor | null;
  draft: string;
};

export type CompareMeasureCommentsActions = {
  focusAnchor: (anchor: AiMeasureAnchor | null) => void;
  changeDraft: (draft: string) => void;
  addComment: () => void;
  removeComment: (anchorKey: string, commentId: string) => void;
};

type CompareMeasureCommentsProps = {
  model: CompareMeasureCommentsModel;
  actions: CompareMeasureCommentsActions;
};

export function CompareMeasureComments({
  model: { threads, focusedAnchor, draft },
  actions,
}: CompareMeasureCommentsProps) {
  const threadList = Object.values(threads);
  if (!focusedAnchor && threadList.length === 0) {
    return null;
  }

  return (
    <div className="flex-none rounded border border-sky-200 bg-sky-50 p-2 text-caption text-slate-600">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-sky-700">Measure comments</span>
        {focusedAnchor && (
          <button
            type="button"
            className="text-sky-600 hover:underline"
            onClick={() => {
              actions.focusAnchor(null);
              actions.changeDraft('');
            }}
          >
            Close
          </button>
        )}
      </div>
      {focusedAnchor ? (
        <div className="space-y-1">
          <div className="text-caption text-slate-500">
            Part {focusedAnchor.partIndex + 1} · Measure {focusedAnchor.measureNumber}
          </div>
          {(threads[focusedAnchor.key]?.comments ?? []).map((entry) => (
            <div key={entry.id} className="rounded border border-slate-200 bg-white px-2 py-1">
              <div className="flex items-center justify-between text-caption text-slate-500">
                <span
                  className={entry.author === 'assistant' ? 'text-emerald-600' : 'text-sky-600'}
                >
                  {entry.author === 'assistant' ? 'Assistant' : 'You'}
                </span>
                <button
                  type="button"
                  className="text-slate-500 hover:text-rose-500"
                  onClick={() => actions.removeComment(focusedAnchor.key, entry.id)}
                  aria-label="Remove comment"
                >
                  ×
                </button>
              </div>
              <div className="whitespace-pre-wrap text-caption text-slate-700">{entry.text}</div>
            </div>
          ))}
          <textarea
            value={draft}
            onChange={(event) => actions.changeDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                actions.addComment();
              }
            }}
            placeholder="Add a comment for this measure…"
            className="w-full rounded border border-slate-200 px-2 py-1 text-caption"
            rows={2}
          />
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={actions.addComment}
            className="w-full rounded border border-sky-300 bg-white px-2 py-1 text-caption text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            Add comment
          </button>
        </div>
      ) : (
        <div className="text-caption text-slate-500">
          Click a measure in either pane to add a comment.
        </div>
      )}
      {threadList.length > 0 && (
        <div className="mt-2 border-t border-sky-200 pt-1">
          <div className="mb-1 text-caption uppercase tracking-wide text-slate-500">Threads</div>
          <div className="flex flex-wrap gap-1">
            {threadList
              .slice()
              .sort((a, b) => a.measureNumber - b.measureNumber)
              .map((thread) => (
                <button
                  key={thread.key}
                  type="button"
                  onClick={() => {
                    actions.focusAnchor({
                      key: thread.key,
                      partIndex: thread.partIndex,
                      measureNumber: thread.measureNumber,
                      leftIndex: thread.leftIndex,
                      rightIndex: thread.rightIndex,
                    });
                    actions.changeDraft('');
                  }}
                  className={`rounded border px-1 py-0.5 text-caption ${focusedAnchor?.key === thread.key ? 'border-sky-400 bg-sky-100 text-sky-700' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  m{thread.measureNumber} · {thread.comments.length}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
