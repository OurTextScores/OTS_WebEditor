/**
 * The Accompany (AMT) tab of the AI tools sidebar: write new parts under a melody with the
 * Anticipatory Music Transformer, for the selected bars.
 *
 * Presentational: it renders the source, settings and result, and calls back. It holds no
 * request state and never touches the score.
 */
import { Button } from '../../ui/Button';

export type AmtModel = 'small-800k' | 'medium-800k' | 'large-800k';

export type GeneratedPartSummary = { instrument: string; noteCount: number };

export type AmtAccompanyPanelProps = {
  source: {
    hasScore: boolean;
    /** One-based, inclusive; null until the score has been read. */
    range: { start: number; end: number } | null;
    tracks: { index: number; name: string; noteCount: number }[];
    readSelection: () => void;
  };
  settings: {
    melodyTrack: number | null;
    model: AmtModel;
    historySeconds: number;
    setMelodyTrack: (value: number) => void;
    setModel: (value: AmtModel) => void;
    setHistorySeconds: (value: number) => void;
  };
  status: {
    busy: boolean;
    applying: boolean;
    error: string | null;
    warnings: string[];
  };
  result: {
    parts: GeneratedPartSummary[];
    canAdd: boolean;
    canDownload: boolean;
  } | null;
  actions: {
    generate: () => void;
    addToScore: () => void;
    downloadMidi: () => void;
  };
};

const MODEL_LABELS: Record<AmtModel, string> = {
  'small-800k': 'Small (fastest)',
  'medium-800k': 'Medium',
  'large-800k': 'Large (best, slowest)',
};

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
const fieldClass = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700';

export function AmtAccompanyPanel({
  source,
  settings,
  status,
  result,
  actions,
}: AmtAccompanyPanelProps) {
  const rangeLabel = source.range
    ? source.range.start === source.range.end
      ? `Bar ${source.range.start}`
      : `Bars ${source.range.start}–${source.range.end}`
    : 'Not read yet';

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700" data-testid="amt-accompany-panel">
      <div className="space-y-3 rounded border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-center justify-between">
          <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">
            Accompany (AMT)
          </div>
          <a
            href="https://crfm.stanford.edu/2023/06/16/anticipatory-music-transformer.html"
            target="_blank"
            rel="noreferrer"
            title="Anticipatory Music Transformer"
            aria-label="About the Anticipatory Music Transformer"
            className="text-sm leading-none text-slate-500 hover:text-slate-700"
          >
            ⓘ
          </a>
        </div>
        <p className="text-caption leading-snug text-slate-500">
          Keeps the melody part and writes new parts under it for the selected bars (the whole score
          when nothing is selected). The parts are added to the score as new instruments.
        </p>

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className={labelClass}>Range</div>
            <div className="text-sm" data-testid="amt-range">
              {rangeLabel}
            </div>
          </div>
          <Button
            variant="neutral"
            size="xs"
            onClick={source.readSelection}
            disabled={!source.hasScore || status.busy}
          >
            Use selection
          </Button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Melody part</span>
          <select
            value={settings.melodyTrack ?? ''}
            onChange={(e) => settings.setMelodyTrack(Number(e.target.value))}
            disabled={source.tracks.length === 0}
            className={fieldClass}
            aria-label="Melody part"
          >
            {source.tracks.length === 0 && <option value="">Read the score first</option>}
            {source.tracks.map((track) => (
              <option key={track.index} value={track.index}>
                {track.name || `Track ${track.index}`} ({track.noteCount} notes)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Model</span>
          <select
            value={settings.model}
            onChange={(e) => settings.setModel(e.target.value as AmtModel)}
            className={fieldClass}
            aria-label="AMT model"
          >
            {(Object.keys(MODEL_LABELS) as AmtModel[]).map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Prompt: {settings.historySeconds}s</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.historySeconds}
            onChange={(e) => settings.setHistorySeconds(Number(e.target.value))}
            aria-label="Prompt length in seconds"
          />
          <span className="text-caption leading-snug text-slate-500">
            Seconds of the other parts kept as a starting point; the model rewrites them after that.
          </span>
        </label>

        <Button
          variant="primary"
          className="w-full"
          onClick={actions.generate}
          disabled={!source.hasScore || status.busy}
        >
          {status.busy ? 'Writing accompaniment…' : result ? 'Try again' : 'Write accompaniment'}
        </Button>

        {status.error && (
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
          >
            {status.error}
          </div>
        )}
        {status.warnings.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded border border-amber-200 bg-amber-50 px-4 py-1 text-xs text-amber-700">
            {status.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {result && (
        <div className="space-y-2 rounded border border-slate-200 bg-white p-3">
          <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">
            Result
          </div>
          {result.parts.length === 0 ? (
            <p className="text-caption text-slate-500">The model wrote no new notes. Try again.</p>
          ) : (
            <ul className="text-sm" data-testid="amt-parts">
              {result.parts.map((part, i) => (
                <li key={i}>
                  {part.instrument} · {part.noteCount} {part.noteCount === 1 ? 'note' : 'notes'}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="xs"
              onClick={actions.addToScore}
              disabled={!result.canAdd || status.applying}
            >
              {status.applying ? 'Adding…' : 'Add to score'}
            </Button>
            <Button
              variant="neutral"
              size="xs"
              onClick={actions.downloadMidi}
              disabled={!result.canDownload}
            >
              Download MIDI
            </Button>
          </div>
          {!result.canAdd && result.canDownload && (
            <p className="text-caption text-slate-500">
              MusicXML unavailable. Download the MIDI instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
