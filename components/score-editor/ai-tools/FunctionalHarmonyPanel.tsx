import { CodeMirrorEditor, type CodeEditorThemeMode } from '../../CodeMirrorEditor';
import { asRecord } from '@/lib/as-record';

/**
 * The functional-harmony (Roman numeral) tab of the AI tools sidebar.
 *
 * Presentational: renders the analysis result, its segment table and the export
 * editors, and calls back. Downloads keep their format argument, which is the only
 * thing separating the JSON export from the RomanText one.
 */
export type FunctionalHarmonyPanelProps = {
  status: {
    busy: boolean;
    error: string | null;
  };
  result: {
    payload: Record<string, unknown> | null;
    segments: Record<string, unknown>[];
    warnings: string[];
    annotatedXml: string;
    jsonExport: string;
    rntxtExport: string;
    setAnnotatedXml: (value: string) => void;
    setRntxtExport: (value: string) => void;
  };
  actions: {
    analyze: () => void;
    applyOutput: () => void;
    download: (format: 'json' | 'rntxt') => void;
    downloadXml: () => void;
  };
  editorTheme: CodeEditorThemeMode;
};

export function FunctionalHarmonyPanel({
  status,
  result,
  actions,
  editorTheme,
}: FunctionalHarmonyPanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const functionalHarmonyBusy = status.busy;
  const functionalHarmonyError = status.error;

  const functionalHarmonyResult = result.payload;
  const functionalHarmonySegments = result.segments;
  const functionalHarmonyWarnings = result.warnings;
  const functionalHarmonyAnnotatedXml = result.annotatedXml;
  const functionalHarmonyJsonExport = result.jsonExport;
  const functionalHarmonyRntxtExport = result.rntxtExport;
  const setFunctionalHarmonyAnnotatedXml = result.setAnnotatedXml;
  const setFunctionalHarmonyRntxtExport = result.setRntxtExport;

  const handleFunctionalHarmonyAnalyze = actions.analyze;
  const handleApplyFunctionalHarmonyOutput = actions.applyOutput;
  const handleDownloadFunctionalHarmony = actions.download;
  const handleDownloadFunctionalHarmonyXml = actions.downloadXml;

  const codeEditorTheme = editorTheme;

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <div className="rounded border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">
          Harmony
        </div>
        <div className="text-xs text-slate-600">
          Roman-numeral and local-key analysis for theory-oriented review. This workflow does not
          modify the score in Phase 1.
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleFunctionalHarmonyAnalyze()}
            disabled={functionalHarmonyBusy}
            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-functional-harmony-analyze"
          >
            {functionalHarmonyBusy ? 'Analyzing...' : 'Analyze Harmony'}
          </button>
          <button
            type="button"
            onClick={() => handleDownloadFunctionalHarmony('json')}
            disabled={!functionalHarmonyJsonExport.trim()}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-functional-harmony-download-json"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={() => handleDownloadFunctionalHarmony('rntxt')}
            disabled={!functionalHarmonyRntxtExport.trim()}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-functional-harmony-download-rntxt"
          >
            Download RN Text
          </button>
          <button
            type="button"
            onClick={handleDownloadFunctionalHarmonyXml}
            disabled={!functionalHarmonyAnnotatedXml.trim()}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-functional-harmony-download-xml"
          >
            Download Annotated XML
          </button>
          <button
            type="button"
            onClick={() => void handleApplyFunctionalHarmonyOutput()}
            disabled={functionalHarmonyBusy || !functionalHarmonyAnnotatedXml.trim()}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-functional-harmony-apply-xml"
          >
            Apply Roman Numerals
          </button>
        </div>
      </div>
      <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
        Use Chordify for chord symbols and MMA preparation. Use Harmony for Roman numerals, local
        keys, and cadence/modulation summaries.
      </div>
      {functionalHarmonyError && (
        <div className="text-xs text-red-600">{functionalHarmonyError}</div>
      )}
      {functionalHarmonyWarnings.length > 0 && (
        <div className="space-y-1">
          {functionalHarmonyWarnings.map((warning, index) => (
            <div
              key={`functional-harmony-warning-${index}`}
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {warning}
            </div>
          ))}
        </div>
      )}
      {functionalHarmonyResult && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              'Measures',
              String(Number(asRecord(functionalHarmonyResult.analysis)?.measureCount ?? 0) || 0),
            ],
            [
              'Segments',
              String(Number(asRecord(functionalHarmonyResult.analysis)?.segmentCount ?? 0) || 0),
            ],
            ['Coverage', String(asRecord(functionalHarmonyResult.analysis)?.coverage ?? '0')],
            [
              'Local Keys',
              String(Number(asRecord(functionalHarmonyResult.analysis)?.localKeyCount ?? 0) || 0),
            ],
            [
              'Modulations',
              String(Number(asRecord(functionalHarmonyResult.analysis)?.modulationCount ?? 0) || 0),
            ],
            [
              'Cadences',
              String(Number(asRecord(functionalHarmonyResult.analysis)?.cadenceCount ?? 0) || 0),
            ],
            ['Backend', String(asRecord(functionalHarmonyResult.analysis)?.engine ?? 'n/a')],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </div>
              <div className="mt-1 text-sm text-slate-800">{value}</div>
            </div>
          ))}
        </div>
      )}
      {functionalHarmonySegments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Segments</span>
            <span>{functionalHarmonySegments.length} segment(s)</span>
          </div>
          <div className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Measure</th>
                  <th className="px-3 py-2 font-semibold">RN</th>
                  <th className="px-3 py-2 font-semibold">Key</th>
                  <th className="px-3 py-2 font-semibold">Function</th>
                  <th className="px-3 py-2 font-semibold">Cadence</th>
                  <th className="px-3 py-2 font-semibold">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {functionalHarmonySegments.slice(0, 200).map((segment, index) => (
                  <tr
                    key={`functional-harmony-segment-${index}`}
                    className="border-t border-slate-200"
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {String(segment.measureNumber ?? segment.measureIndex ?? '')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900">
                      {String(segment.romanNumeral ?? '')}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{String(segment.key ?? '')}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {String(segment.functionLabel ?? '')}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {String(segment.cadenceLabel ?? '')}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {segment.confidence === undefined || segment.confidence === null
                        ? ''
                        : String(segment.confidence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {functionalHarmonyRntxtExport && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>RN Text Export</span>
            <span>Review before download</span>
          </div>
          <CodeMirrorEditor
            testId="functional-harmony-rntxt"
            value={functionalHarmonyRntxtExport}
            onChange={(nextValue) => setFunctionalHarmonyRntxtExport(nextValue)}
            readOnly={false}
            language="none"
            placeholderText="Harmony text export will appear here."
            height={180}
            maxHeight={280}
            themeMode={codeEditorTheme}
          />
        </div>
      )}
      {functionalHarmonyAnnotatedXml && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Annotated MusicXML</span>
            <span>Review before applying</span>
          </div>
          <CodeMirrorEditor
            testId="functional-harmony-annotated-xml"
            value={functionalHarmonyAnnotatedXml}
            onChange={(nextValue) => setFunctionalHarmonyAnnotatedXml(nextValue)}
            readOnly={false}
            language="xml"
            placeholderText="Annotated MusicXML will appear here."
            height={220}
            maxHeight={360}
            themeMode={codeEditorTheme}
          />
        </div>
      )}
      {functionalHarmonyResult && (
        <details className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">
            Harmony Response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-caption leading-relaxed text-slate-700 whitespace-pre-wrap">
            {JSON.stringify(functionalHarmonyResult, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
