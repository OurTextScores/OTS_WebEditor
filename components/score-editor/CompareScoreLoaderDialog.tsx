import React, { useRef, useState } from 'react';

const SCORE_FILE_ACCEPT = '.mscz,.mscx,.mxl,.xml,.musicxml';

export type CompareScoreLoaderDialogProps = {
  busy: boolean;
  error: string | null;
  onCompare: (leftFile: File, rightFile: File) => void | Promise<void>;
  onClose: () => void;
};

export function CompareScoreLoaderDialog({
  busy,
  error,
  onCompare,
  onClose,
}: CompareScoreLoaderDialogProps) {
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const leftInputRef = useRef<HTMLInputElement>(null);
  const rightInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-score-loader-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      data-testid="compare-score-loader-modal"
    >
      <div className="w-full max-w-lg rounded bg-white p-4 shadow-modal">
        <div className="flex items-center justify-between gap-3">
          <div id="compare-score-loader-title" className="text-sm font-semibold text-slate-800">
            Compare scores
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-slate-700">
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            The left score is the reference. The right score replaces the current score and remains
            editable in the comparison.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Left score
              </div>
              <button
                type="button"
                onClick={() => leftInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Load left score
              </button>
              <input
                ref={leftInputRef}
                data-testid="compare-left-score-input"
                type="file"
                accept={SCORE_FILE_ACCEPT}
                onChange={(event) => setLeftFile(event.target.files?.[0] ?? null)}
                disabled={busy}
                className="hidden"
              />
              <div className="mt-2 truncate text-xs text-slate-500" title={leftFile?.name}>
                {leftFile?.name || 'No score selected'}
              </div>
            </div>

            <div className="rounded border border-slate-200 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Right score
              </div>
              <button
                type="button"
                onClick={() => rightInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Load right score
              </button>
              <input
                ref={rightInputRef}
                data-testid="compare-right-score-input"
                type="file"
                accept={SCORE_FILE_ACCEPT}
                onChange={(event) => setRightFile(event.target.files?.[0] ?? null)}
                disabled={busy}
                className="hidden"
              />
              <div className="mt-2 truncate text-xs text-slate-500" title={rightFile?.name}>
                {rightFile?.name || 'No score selected'}
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (leftFile && rightFile) {
                  void onCompare(leftFile, rightFile);
                }
              }}
              disabled={!leftFile || !rightFile || busy}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Loading…' : 'Compare'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
