import { CodeMirrorEditor, type CodeEditorThemeMode } from '../../CodeMirrorEditor';
import { findMmaGrooveOption, MMA_GROOVE_OPTION_GROUPS } from '@/lib/music-mma-grooves';
import { MMA_ARRANGEMENT_PRESETS, type MmaArrangementPreset } from '@/lib/music-mma-presets';

export type MmaStarterPreset = 'blank' | 'lead-sheet' | 'blues';

/**
 * The MMA (accompaniment) tab of the AI tools sidebar.
 *
 * Extracted from ScoreEditor as a presentational owner: it renders the tab's controls
 * and results and calls back. It holds no MMA state, performs no request and never
 * touches the score. The preset and groove catalogues are static data, so they are
 * imported here rather than threaded through props.
 */
export type MmaPanelProps = {
  config: {
    starterPreset: MmaStarterPreset;
    arrangementPreset: MmaArrangementPreset;
    groove: string;
    script: string;
    setStarterPreset: (value: MmaStarterPreset) => void;
    setArrangementPreset: (value: MmaArrangementPreset) => void;
    setGroove: (value: string) => void;
    setScript: (value: string) => void;
    editorTheme: CodeEditorThemeMode;
  };
  status: {
    busy: boolean;
    harmonyBusy: boolean;
    error: string | null;
  };
  result: {
    generatedXml: string;
    midiBase64: string;
    warnings: string[];
    sanitizedStderr: string;
    payload: Record<string, unknown> | null;
    setGeneratedXml: (value: string) => void;
  };
  actions: {
    generateTemplate: () => void;
    chordifyAndGenerate: () => void;
    render: (includeMusicXml: boolean) => void;
    download: (format: 'mma' | 'midi' | 'musicxml') => void;
    applyOutput: () => void;
    openChordify: () => void;
  };
};

export function MmaPanel({ config, status, result, actions }: MmaPanelProps) {
  // Single mapping column, as in CompareDiffGutter: the JSX below is the moved block,
  // so this is the only place a name can be bound to the wrong value.
  const mmaStarterPreset = config.starterPreset;
  const mmaArrangementPreset = config.arrangementPreset;
  const mmaGroove = config.groove;
  const mmaScript = config.script;
  const handleMmaStarterPresetChange = config.setStarterPreset;
  const setMmaArrangementPreset = config.setArrangementPreset;
  const setMmaGroove = config.setGroove;
  const setMmaScript = config.setScript;
  const codeEditorTheme = config.editorTheme;

  const mmaBusy = status.busy;
  const harmonyBusy = status.harmonyBusy;
  const mmaError = status.error;

  const mmaGeneratedXml = result.generatedXml;
  const mmaMidiBase64 = result.midiBase64;
  const mmaWarnings = result.warnings;
  const mmaSanitizedStderr = result.sanitizedStderr;
  const mmaResultPayload = result.payload;
  const setMmaGeneratedXml = result.setGeneratedXml;

  const handleMmaGenerateTemplate = actions.generateTemplate;
  const handleMmaRender = actions.render;
  const handleMmaDownload = actions.download;
  const handleApplyMmaOutput = actions.applyOutput;

  return (
    <div className="mt-3 space-y-3 text-sm text-gray-700">
      <div className="rounded border border-gray-200 bg-gray-50/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            MMA (Accompaniment)
          </div>
          <a
            href="https://www.mellowood.ca/mma/"
            target="_blank"
            rel="noreferrer"
            title="MMA project documentation"
            aria-label="Open MMA project documentation"
            className="text-sm leading-none text-gray-500 hover:text-gray-700"
          >
            ⓘ
          </a>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Starter
            </span>
            <select
              value={mmaStarterPreset}
              onChange={(event) =>
                handleMmaStarterPresetChange(event.target.value as MmaStarterPreset)
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              data-testid="select-mma-starter"
            >
              <option value="blank">Blank</option>
              <option value="lead-sheet">Lead Sheet (auto)</option>
              <option value="blues">12-bar Blues (demo)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Arrangement
            </span>
            <select
              value={mmaArrangementPreset}
              onChange={(event) =>
                setMmaArrangementPreset(event.target.value as MmaArrangementPreset)
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              data-testid="select-mma-arrangement"
            >
              {MMA_ARRANGEMENT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Groove
            </span>
            <select
              value={mmaGroove}
              onChange={(event) => setMmaGroove(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              data-testid="select-mma-groove"
            >
              {MMA_GROOVE_OPTION_GROUPS.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            {MMA_ARRANGEMENT_PRESETS.find((preset) => preset.id === mmaArrangementPreset)
              ?.description || 'Use the groove as-is with its default accompaniment layers.'}
          </div>
          <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
            {findMmaGrooveOption(mmaGroove)?.description ||
              'Curated MMA groove from the local installed groove library.'}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleMmaGenerateTemplate}
              disabled={mmaBusy}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="btn-mma-generate-template"
            >
              {mmaBusy ? 'Working...' : 'Generate from Score'}
            </button>
          </div>
        </div>
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div>For better MMA results, generate chord tags first with Chordify.</div>
          <div className="mt-2">
            <button
              type="button"
              onClick={actions.openChordify}
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Open Chordify
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={actions.chordifyAndGenerate}
            disabled={mmaBusy || harmonyBusy}
            className="w-full rounded border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-analyze-harmony-template"
          >
            {mmaBusy || harmonyBusy ? 'Working...' : 'Chordify + Generate'}
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>MMA Script</span>
            <span>{mmaScript.trim() ? `${mmaScript.length} chars` : 'No script'}</span>
          </div>
          <CodeMirrorEditor
            testId="mma-editor"
            value={mmaScript}
            onChange={(nextValue) => setMmaScript(nextValue)}
            readOnly={mmaBusy}
            placeholderText="Paste or author an MMA script."
            language="none"
            height={200}
            maxHeight={320}
            themeMode={codeEditorTheme}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleMmaRender(false)}
            disabled={mmaBusy || !mmaScript.trim()}
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-render-midi"
          >
            {mmaBusy ? 'Rendering...' : 'Render MIDI'}
          </button>
          <button
            type="button"
            onClick={() => void handleMmaRender(true)}
            disabled={mmaBusy || !mmaScript.trim()}
            className="flex-1 rounded border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-render-xml"
          >
            {mmaBusy ? 'Rendering...' : 'Render + Convert to XML'}
          </button>
        </div>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Applying MMA output appends accompaniment instruments as new parts in the current score.
      </div>
      {mmaError && <div className="text-xs text-red-600">{mmaError}</div>}
      {mmaWarnings.length > 0 && (
        <div className="space-y-1">
          {mmaWarnings.map((warning, index) => (
            <div
              key={`mma-warning-${index}`}
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              {warning}
            </div>
          ))}
        </div>
      )}
      {mmaSanitizedStderr && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">MMA diagnostics (sanitized)</div>
          <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
            {mmaSanitizedStderr}
          </pre>
        </div>
      )}
      {(mmaMidiBase64 || mmaGeneratedXml) && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleMmaDownload('mma')}
            disabled={!mmaScript.trim()}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-download-script"
          >
            Download .mma
          </button>
          <button
            type="button"
            onClick={() => handleMmaDownload('midi')}
            disabled={!mmaMidiBase64.trim()}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-download-midi"
          >
            Download .mid
          </button>
          <button
            type="button"
            onClick={() => handleMmaDownload('musicxml')}
            disabled={!mmaGeneratedXml.trim()}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-download-xml"
          >
            Download .musicxml
          </button>
          <button
            type="button"
            onClick={handleApplyMmaOutput}
            disabled={mmaBusy || !mmaGeneratedXml.trim()}
            className="rounded border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="btn-mma-apply-xml"
          >
            Append Parts to Score
          </button>
        </div>
      )}
      {mmaGeneratedXml && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Generated MusicXML</span>
            <span>Review before applying</span>
          </div>
          <CodeMirrorEditor
            testId="mma-generated-xml"
            value={mmaGeneratedXml}
            onChange={(nextValue) => setMmaGeneratedXml(nextValue)}
            readOnly={false}
            language="xml"
            placeholderText="Rendered MusicXML will appear here."
            height={220}
            maxHeight={360}
            themeMode={codeEditorTheme}
          />
        </div>
      )}
      {mmaResultPayload && (
        <details className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-gray-700">
            MMA Response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
            {JSON.stringify(mmaResultPayload, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
