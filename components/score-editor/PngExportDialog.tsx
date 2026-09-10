import type { FormEvent } from 'react';

/**
 * PNG export dialog: chooses which pages to render before the owner exports them.
 *
 * Presentational; the owner owns the export itself and the page-string parsing.
 */
export type PngExportDialogProps = {
  /** Page count of the current score, so the dialog can state the valid range. */
  pageCount: number;
  pageInput: string;
  setPageInput: (value: string) => void;
  busy: boolean;
  onConfirm: (event?: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function PngExportDialog({
  pageCount,
  pageInput,
  setPageInput,
  busy,
  onConfirm,
  onClose,
}: PngExportDialogProps) {
  const pngExportPageInput = pageInput;
  const setPngExportPageInput = setPageInput;
  const pngExportBusy = busy;
  const handleConfirmExportPng = onConfirm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      data-testid="png-export-modal"
    >
      <form
        onSubmit={handleConfirmExportPng}
        className="w-full max-w-sm rounded bg-white p-4 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">Export PNG</div>
          <button
            type="button"
            onClick={onClose}
            disabled={pngExportBusy}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-gray-700">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Page
            </span>
            <input
              data-testid="png-export-page-input"
              type="number"
              min={1}
              max={Math.max(1, pageCount)}
              value={pngExportPageInput}
              onChange={(event) => setPngExportPageInput(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="text-xs text-gray-500">
            Current score has {Math.max(1, pageCount)}{' '}
            {Math.max(1, pageCount) === 1 ? 'page' : 'pages'}.
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            data-testid="btn-confirm-export-png"
            disabled={pngExportBusy}
            className="flex-1 rounded border border-gray-300 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pngExportBusy ? 'Exporting...' : 'Export'}
          </button>
          <button
            type="button"
            data-testid="btn-cancel-export-png"
            onClick={onClose}
            disabled={pngExportBusy}
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
