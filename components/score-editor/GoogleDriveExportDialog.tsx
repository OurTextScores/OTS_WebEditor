/**
 * Google Drive export dialog. It explains the flow and hands off to the share-link
 * dialog; the owner performs the upload.
 */
export type GoogleDriveExportDialogProps = {
  onOpenShareLink: () => void;
  onClose: () => void;
};

export function GoogleDriveExportDialog({
  onOpenShareLink,
  onClose,
}: GoogleDriveExportDialogProps) {
  const handleOpenShareLinkDialog = onOpenShareLink;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
      data-testid="google-drive-export-modal"
    >
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-modal">
          <div className="flex items-center justify-between gap-4">
            <div className="text-base font-semibold text-slate-900">Export to Google Drive</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm text-slate-700">
            <li>
              <strong>score.mscz</strong> has been downloaded.
            </li>
            <li>Open Google Drive and upload the downloaded file.</li>
            <li>
              Set General access to <strong>Anyone with the link</strong>, then copy its share link.
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://drive.google.com/drive/my-drive"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Google Drive
            </a>
            <button
              type="button"
              data-testid="btn-drive-next-share-link"
              onClick={handleOpenShareLinkDialog}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Create Shareable Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
