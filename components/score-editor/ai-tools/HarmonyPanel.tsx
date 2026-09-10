import { CodeMirrorEditor, type CodeEditorThemeMode } from '../../CodeMirrorEditor';
import { asRecord } from '@/lib/as-record';

export type HarmonyRhythmMode = 'auto' | 'measure' | 'beat';

/**
 * The Chordify (harmony analysis) tab of the AI tools sidebar.
 *
 * Presentational: renders the analysis settings and result and calls back. The three
 * analyze buttons differ only by which follow-up work the owner performs, so they are
 * three named actions rather than one action taking a flag object the panel would have
 * to understand.
 */
export type HarmonyPanelProps = {
  config: {
    rhythmMode: HarmonyRhythmMode;
    maxChangesPerMeasure: number;
    setRhythmMode: (value: HarmonyRhythmMode) => void;
    setMaxChangesPerMeasure: (value: number) => void;
  };
  status: {
    busy: boolean;
    /** MMA is busy: only the combined Chordify + MMA action has to wait for it. */
    mmaBusy: boolean;
    error: string | null;
  };
  result: {
    generatedXml: string;
    warnings: string[];
    payload: Record<string, unknown> | null;
    setGeneratedXml: (value: string) => void;
  };
  actions: {
    analyze: () => void;
    analyzeAndApply: () => void;
    analyzeAndGenerateMma: () => void;
    applyOutput: () => void;
    downloadXml: () => void;
  };
  editorTheme: CodeEditorThemeMode;
};

export function HarmonyPanel({ config, status, result, actions, editorTheme }: HarmonyPanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const harmonyRhythmMode = config.rhythmMode;
  const harmonyMaxChangesPerMeasure = config.maxChangesPerMeasure;
  const setHarmonyRhythmMode = config.setRhythmMode;
  const setHarmonyMaxChangesPerMeasure = config.setMaxChangesPerMeasure;

  const harmonyBusy = status.busy;
  const mmaBusy = status.mmaBusy;
  const harmonyError = status.error;

  const harmonyGeneratedXml = result.generatedXml;
  const harmonyWarnings = result.warnings;
  const harmonyResultPayload = result.payload;
  const setHarmonyGeneratedXml = result.setGeneratedXml;

  const handleApplyHarmonyOutput = actions.applyOutput;
  const handleDownloadHarmonyXml = actions.downloadXml;

  const codeEditorTheme = editorTheme;

  return (
    <div className="mt-3 space-y-3 text-sm text-gray-700">
      <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Chordify
        </div>
        <div className="text-xs text-gray-600">
          Generates MusicXML <code>{'<harmony>'}</code> tags using a music21-based analyzer. This
          improves MMA templates and can be used as a standalone chord-symbol enrichment pass.
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Harmonic Rhythm
            </span>
            <select
              value={harmonyRhythmMode}
              onChange={(event) => setHarmonyRhythmMode(event.target.value as HarmonyRhythmMode)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              data-testid="select-harmony-rhythm"
            >
              <option value="auto">Auto (strong beats only)</option>
              <option value="measure">One chord per measure</option>
              <option value="beat">Allow beat-level changes</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Max Changes / Measure
            </span>
            <input
              type="number"
              min={1}
              max={8}
              step={1}
              value={harmonyMaxChangesPerMeasure}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setHarmonyMaxChangesPerMeasure(
                  Number.isFinite(next) ? Math.min(8, Math.max(1, next)) : 2,
                );
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              data-testid="input-harmony-max-changes"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={actions.analyze}
            disabled={harmonyBusy}
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-harmony-analyze"
          >
            {harmonyBusy ? 'Analyzing...' : 'Chordify Score'}
          </button>
          <button
            type="button"
            onClick={actions.analyzeAndApply}
            disabled={harmonyBusy}
            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-harmony-analyze-apply"
          >
            {harmonyBusy ? 'Analyzing...' : 'Chordify + Apply Tags'}
          </button>
          <button
            type="button"
            onClick={actions.analyzeAndGenerateMma}
            disabled={harmonyBusy || mmaBusy}
            className="flex-1 rounded border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-harmony-analyze-mma"
          >
            {harmonyBusy || mmaBusy ? 'Working...' : 'Chordify + Generate MMA'}
          </button>
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This feature generates chord-symbol tags for accompaniment and score enrichment. Use Harmony
        for Roman numerals, local keys, and cadence summaries.
      </div>
      {harmonyError && <div className="text-xs text-red-600">{harmonyError}</div>}
      {harmonyWarnings.length > 0 && (
        <div className="space-y-1">
          {harmonyWarnings.map((warning, index) => (
            <div
              key={`harmony-warning-${index}`}
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {warning}
            </div>
          ))}
        </div>
      )}
      {harmonyResultPayload && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              'Measures',
              String(Number(asRecord(harmonyResultPayload.analysis)?.measureCount ?? 0) || 0),
            ],
            [
              'Tagged',
              String(Number(asRecord(harmonyResultPayload.analysis)?.harmonyTagCount ?? 0) || 0),
            ],
            ['Coverage', String(asRecord(harmonyResultPayload.analysis)?.coverage ?? '0')],
            [
              'Local Key',
              String(asRecord(harmonyResultPayload.analysis)?.localKeyStrategy ?? 'n/a'),
            ],
            ['Rhythm', String(asRecord(harmonyResultPayload.analysis)?.harmonicRhythm ?? 'n/a')],
            [
              'Fallbacks',
              String(Number(asRecord(harmonyResultPayload.analysis)?.fallbackCount ?? 0) || 0),
            ],
            [
              'Suppressed',
              String(
                Number(asRecord(harmonyResultPayload.analysis)?.suppressedChangeCount ?? 0) || 0,
              ),
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {label}
              </div>
              <div className="mt-1 text-sm text-gray-800">{value}</div>
            </div>
          ))}
        </div>
      )}
      {harmonyGeneratedXml && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadHarmonyXml}
              disabled={!harmonyGeneratedXml.trim()}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="btn-harmony-download-xml"
            >
              Download Tagged XML
            </button>
            <button
              type="button"
              onClick={handleApplyHarmonyOutput}
              disabled={harmonyBusy || !harmonyGeneratedXml.trim()}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="btn-harmony-apply-xml"
            >
              Apply Tagged XML
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Tagged MusicXML</span>
              <span>Review before applying</span>
            </div>
            <CodeMirrorEditor
              testId="harmony-generated-xml"
              value={harmonyGeneratedXml}
              onChange={(nextValue) => setHarmonyGeneratedXml(nextValue)}
              readOnly={false}
              language="xml"
              placeholderText="Tagged MusicXML will appear here."
              height={220}
              maxHeight={360}
              themeMode={codeEditorTheme}
            />
          </div>
        </>
      )}
      {harmonyResultPayload && (
        <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-gray-700">
            Chordify Response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
            {JSON.stringify(harmonyResultPayload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
