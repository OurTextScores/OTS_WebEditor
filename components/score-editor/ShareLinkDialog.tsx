import type { FormEvent } from 'react';

/**
 * Share-link dialog: turns a Google Drive URL into a shareable editor link.
 *
 * Presentational; the owner builds the link and owns the clipboard write.
 */
export type ShareLinkDialogProps = {
  driveUrl: string;
  setDriveUrl: (value: string) => void;
  generatedUrl: string;
  setGeneratedUrl: (value: string) => void;
  copied: boolean;
  setCopied: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  onGenerate: (event?: FormEvent<HTMLFormElement>) => void;
  onCopy: () => void;
  onClose: () => void;
};

export function ShareLinkDialog({
  driveUrl,
  setDriveUrl,
  generatedUrl,
  setGeneratedUrl,
  copied,
  setCopied,
  error,
  setError,
  onGenerate,
  onCopy,
  onClose,
}: ShareLinkDialogProps) {
  const googleDriveShareUrl = driveUrl;
  const setGoogleDriveShareUrl = setDriveUrl;
  const generatedShareUrl = generatedUrl;
  const setGeneratedShareUrl = setGeneratedUrl;
  const shareLinkCopied = copied;
  const setShareLinkCopied = setCopied;
  const shareLinkError = error;
  const setShareLinkError = setError;
  const handleGenerateShareLink = onGenerate;
  const handleCopyShareLink = onCopy;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40" data-testid="share-link-modal">
      <div className="flex min-h-full items-center justify-center p-6">
        <form
          onSubmit={handleGenerateShareLink}
          className="w-full max-w-xl rounded-lg bg-white p-6 shadow-modal"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-base font-semibold text-slate-900">
              Create Shareable Editor Link
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Paste the public Google Drive file link. The generated URL opens this editor and loads
            that score.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Google Drive share link
            </span>
            <input
              data-testid="google-drive-share-url"
              type="url"
              value={googleDriveShareUrl}
              onChange={(event) => {
                setGoogleDriveShareUrl(event.target.value);
                setGeneratedShareUrl('');
                setShareLinkError('');
                setShareLinkCopied(false);
              }}
              placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              autoFocus
            />
          </label>
          {shareLinkError && <div className="mt-2 text-sm text-red-600">{shareLinkError}</div>}
          <button
            type="submit"
            data-testid="btn-generate-share-link"
            className="mt-4 rounded border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate Link
          </button>
          {generatedShareUrl && (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Shareable editor link
                </span>
                <input
                  data-testid="generated-share-link"
                  readOnly
                  value={generatedShareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <button
                type="button"
                data-testid="btn-copy-share-link"
                onClick={() => {
                  void handleCopyShareLink();
                }}
                className="mt-3 rounded border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                {shareLinkCopied ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
