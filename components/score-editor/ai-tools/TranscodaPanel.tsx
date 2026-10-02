/**
 * The Transcoda (image → score transcription) tab of the AI tools sidebar.
 *
 * Presentational: it renders the upload control, the decoding settings and the
 * transcription result, and calls back. It holds no transcription state, performs no
 * request and never touches the score.
 */
/** mm:ss for the elapsed-time readout. Presentation only, so it lives with the panel. */
const formatTranscodaElapsed = (value: number) => {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export type TranscodaPanelProps = {
  input: {
    imageFile: File | null;
    onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  };
  decoding: {
    mode: 'greedy' | 'beam';
    numBeams: number;
    maxLength: number;
    repetitionPenalty: number;
    setMode: (value: 'greedy' | 'beam') => void;
    setNumBeams: (value: number) => void;
    setMaxLength: (value: number) => void;
    setRepetitionPenalty: (value: number) => void;
  };
  status: {
    busy: boolean;
    phase: 'idle' | 'uploading' | 'transcribing';
    elapsedMs: number;
    error: string | null;
    warning: string | null;
  };
  result: {
    generatedXml: string;
    generatedKern: string;
    payload: Record<string, unknown> | null;
  };
  actions: {
    transcribe: () => void;
    applyOutput: (mode: 'overwrite' | 'append') => void;
    /** Owner-side file download; the panel does not build blobs or object URLs. */
    downloadXml: () => void;
  };
  /** Read-only service identity, shown so a reviewer can see what produced a result. */
  service: {
    spaceId: string;
    model: string;
    revision: string;
  };
  /** Applying the transcription to the document is the owner's operation. */
  apply: {
    busy: boolean;
    canAppend: boolean;
  };
};

export function TranscodaPanel({
  input,
  decoding,
  status,
  result,
  actions,
  service,
  apply,
}: TranscodaPanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const musicTranscodaImageFile = input.imageFile;
  const handleTranscodaImageUpload = input.onImageUpload;

  const musicTranscodaDecoding = decoding.mode;
  const musicTranscodaNumBeams = decoding.numBeams;
  const musicTranscodaMaxLength = decoding.maxLength;
  const musicTranscodaRepetitionPenalty = decoding.repetitionPenalty;
  const setMusicTranscodaDecoding = decoding.setMode;
  const setMusicTranscodaNumBeams = decoding.setNumBeams;
  const setMusicTranscodaMaxLength = decoding.setMaxLength;
  const setMusicTranscodaRepetitionPenalty = decoding.setRepetitionPenalty;

  const musicTranscodaBusy = status.busy;
  const musicTranscodaPhase = status.phase;
  const musicTranscodaElapsedMs = status.elapsedMs;
  const musicTranscodaError = status.error;
  const musicTranscodaWarning = status.warning;

  const musicTranscodaGeneratedXml = result.generatedXml;
  const musicTranscodaGeneratedKern = result.generatedKern;
  const musicTranscodaResult = result.payload;

  const handleTranscodaTranscribeImage = actions.transcribe;
  const handleApplyTranscodaOutput = actions.applyOutput;

  const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID = service.spaceId;
  const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL = service.model;
  const MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION = service.revision;

  const xmlLoading = apply.busy;
  const score = apply.canAppend;

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <div className="rounded border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Transcoda OMR
          </div>
          <a
            href="https://huggingface.co/btrkeks/transcoda-59M-zeroshot-v1"
            target="_blank"
            rel="noreferrer"
            title="Transcoda model on Hugging Face"
            aria-label="Open Transcoda model on Hugging Face"
            className="text-sm leading-none text-slate-500 hover:text-slate-700"
          >
            ⓘ
          </a>
        </div>
        <div className="grid gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Space
            </span>
            <input
              value={MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_SPACE_ID}
              readOnly
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              aria-label="Transcoda Space ID"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Model
            </span>
            <input
              value={MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_MODEL}
              readOnly
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              aria-label="Transcoda model ID"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Revision
            </span>
            <input
              value={MUSIC_SPECIALISTS_DEFAULT_TRANSCODA_REVISION}
              readOnly
              className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700"
              aria-label="Transcoda model revision"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Decoding
            </span>
            <select
              value={musicTranscodaDecoding}
              onChange={(e) => setMusicTranscodaDecoding(e.target.value as 'greedy' | 'beam')}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              aria-label="Decoding strategy"
            >
              <option value="greedy">Greedy</option>
              <option value="beam">Beam search</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Max length
            </span>
            <input
              type="number"
              min={1}
              step={64}
              value={musicTranscodaMaxLength}
              onChange={(e) => {
                const v = Math.max(1, Math.floor(Number(e.target.value)));
                if (Number.isFinite(v)) setMusicTranscodaMaxLength(v);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              aria-label="Max length"
            />
          </label>
          {musicTranscodaDecoding === 'beam' && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beam count
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={musicTranscodaNumBeams}
                onChange={(e) => {
                  const v = Math.max(1, Math.floor(Number(e.target.value)));
                  if (Number.isFinite(v)) setMusicTranscodaNumBeams(v);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
                aria-label="Beam count"
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Repetition penalty
            </span>
            <input
              type="number"
              min={0}
              step={0.05}
              value={musicTranscodaRepetitionPenalty}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) setMusicTranscodaRepetitionPenalty(v);
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              aria-label="Repetition penalty"
            />
          </label>
        </div>
        <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
          Upload a single score page image to send to the Transcoda Space.
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Page Image
          </span>
          <input
            data-testid="transcoda-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/tiff,image/bmp,image/*"
            onChange={handleTranscodaImageUpload}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
          />
        </label>
        {musicTranscodaImageFile && (
          <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Selected: {musicTranscodaImageFile.name}
          </div>
        )}
        {musicTranscodaPhase !== 'idle' && (
          <div className="space-y-2 rounded border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <span>
                {musicTranscodaPhase === 'uploading' ? 'Uploading image' : 'Transcribing image'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-slate-800 transition-all duration-200"
                style={{ width: musicTranscodaPhase === 'uploading' ? '33%' : '78%' }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {musicTranscodaPhase === 'uploading'
                  ? 'Preparing image for upload'
                  : 'Waiting for Transcoda response'}
              </span>
              <span>{formatTranscodaElapsed(musicTranscodaElapsedMs)}</span>
            </div>
          </div>
        )}
        {musicTranscodaError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {musicTranscodaError}
          </div>
        )}
        {musicTranscodaWarning && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            {musicTranscodaWarning}
          </div>
        )}
        <button
          type="button"
          disabled={musicTranscodaBusy || !musicTranscodaImageFile}
          onClick={() => void handleTranscodaTranscribeImage()}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="btn-transcoda-transcribe"
          title={
            musicTranscodaImageFile
              ? 'Transcribe the uploaded page image with Transcoda.'
              : 'Upload a page image before transcribing.'
          }
        >
          {musicTranscodaBusy ? 'Transcribing...' : 'Transcribe image'}
        </button>
        {musicTranscodaGeneratedKern && (
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Generated **kern</div>
            <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
              {musicTranscodaGeneratedKern}
            </pre>
          </div>
        )}
        {musicTranscodaGeneratedXml && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleApplyTranscodaOutput('overwrite')}
              disabled={xmlLoading}
              className="flex-1 rounded border border-slate-300 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="btn-transcoda-apply-overwrite"
            >
              Overwrite
            </button>
            <button
              type="button"
              onClick={() => void handleApplyTranscodaOutput('append')}
              disabled={xmlLoading || !score}
              className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="btn-transcoda-apply-append"
            >
              Append
            </button>
            <button
              type="button"
              onClick={actions.downloadXml}
              className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              data-testid="btn-transcoda-download-xml"
            >
              Download
            </button>
          </div>
        )}
        {musicTranscodaResult && (
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Transcoda Response</div>
            <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
              {JSON.stringify(musicTranscodaResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
