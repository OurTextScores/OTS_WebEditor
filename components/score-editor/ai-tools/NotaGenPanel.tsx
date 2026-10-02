import type { RefObject } from 'react';
import { CodeMirrorEditor, type CodeEditorThemeMode } from '../../CodeMirrorEditor';

/**
 * The NotaGen (symbolic generation) tab of the AI tools sidebar.
 *
 * Presentational: renders the period / composer / instrumentation selectors, the
 * streaming progress log and the generated result, and calls back. The three
 * selectors are interdependent -- a period narrows the composer list -- but that
 * dependency is the owner's, which is why the panel receives the current option
 * lists rather than deriving them.
 */
export type NotaGenPanelProps = {
  space: {
    period: string;
    composer: string;
    instrumentation: string;
    periods: string[];
    composers: string[];
    instrumentations: string[];
    optionsError: string | null;
    setPeriod: (value: string) => void;
    setComposer: (value: string) => void;
    setInstrumentation: (value: string) => void;
  };
  status: {
    busy: boolean;
    statusText: string;
    error: string | null;
    progressLog: string;
  };
  result: {
    generatedAbc: string;
    generatedXml: string;
    payload: Record<string, unknown> | null;
    setGeneratedXml: (value: string) => void;
  };
  actions: {
    run: () => void;
    applyOutput: () => void;
  };
  /**
   * Own prop rather than a member of `status`: react-hooks/refs treats every read of
   * an object that holds a ref as a render-time ref access, so a ref inside a model
   * taints the whole model.
   */
  progressRef: RefObject<HTMLPreElement | null>;
  editorTheme: CodeEditorThemeMode;
};

export function NotaGenPanel({
  space,
  status,
  result,
  actions,
  progressRef,
  editorTheme,
}: NotaGenPanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const musicNotaGenSpacePeriod = space.period;
  const musicNotaGenSpaceComposer = space.composer;
  const musicNotaGenSpaceInstrumentation = space.instrumentation;
  const musicNotaGenSpacePeriods = space.periods;
  const musicNotaGenSpaceComposers = space.composers;
  const musicNotaGenSpaceInstrumentations = space.instrumentations;
  const musicNotaGenSpaceOptionsError = space.optionsError;
  const handleNotaGenPeriodChange = space.setPeriod;
  const handleNotaGenComposerChange = space.setComposer;
  const setMusicNotaGenSpaceInstrumentation = space.setInstrumentation;

  const musicNotaGenBusy = status.busy;
  const musicNotaGenStatusText = status.statusText;
  const musicNotaGenError = status.error;
  const musicNotaGenProgressLog = status.progressLog;

  const musicNotaGenGeneratedAbc = result.generatedAbc;
  const musicNotaGenGeneratedXml = result.generatedXml;
  const musicNotaGenResult = result.payload;
  const setMusicNotaGenGeneratedXml = result.setGeneratedXml;

  const handleMusicNotaGenRun = actions.run;
  const handleApplyMusicNotaGenOutput = actions.applyOutput;

  const codeEditorTheme = editorTheme;

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700">
      <div className="rounded border border-slate-200 bg-slate-50/70 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            NotaGen (Generate)
          </div>
          <a
            href="https://github.com/ElectricAlexis/NotaGen/"
            target="_blank"
            rel="noreferrer"
            title="NotaGen project on GitHub"
            aria-label="Open NotaGen project on GitHub"
            className="text-sm leading-none text-slate-500 hover:text-slate-700"
          >
            ⓘ
          </a>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Period
          </label>
          <select
            value={musicNotaGenSpacePeriod}
            onChange={(event) => handleNotaGenPeriodChange(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {(musicNotaGenSpacePeriods.length > 0
              ? musicNotaGenSpacePeriods
              : [musicNotaGenSpacePeriod || '']
            ).map((option) => (
              <option key={option} value={option}>
                {option || 'Select period'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Composer
          </label>
          <select
            value={musicNotaGenSpaceComposer}
            onChange={(event) => handleNotaGenComposerChange(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {(musicNotaGenSpaceComposers.length > 0
              ? musicNotaGenSpaceComposers
              : [musicNotaGenSpaceComposer || '']
            ).map((option) => (
              <option key={option} value={option}>
                {option || 'Select composer'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Instrumentation
          </label>
          <select
            value={musicNotaGenSpaceInstrumentation}
            onChange={(event) => setMusicNotaGenSpaceInstrumentation(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {(musicNotaGenSpaceInstrumentations.length > 0
              ? musicNotaGenSpaceInstrumentations
              : [musicNotaGenSpaceInstrumentation || '']
            ).map((option) => (
              <option key={option} value={option}>
                {option || 'Select instrumentation'}
              </option>
            ))}
          </select>
          {musicNotaGenSpaceOptionsError && (
            <div className="mt-1 text-[11px] text-red-600">{musicNotaGenSpaceOptionsError}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleMusicNotaGenRun}
            disabled={musicNotaGenBusy}
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {musicNotaGenBusy ? 'Working...' : 'Run NotaGen Space'}
          </button>
          <button
            type="button"
            onClick={handleApplyMusicNotaGenOutput}
            disabled={musicNotaGenBusy || !musicNotaGenGeneratedXml.trim()}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Output
          </button>
        </div>
      </div>
      {musicNotaGenError && <div className="text-xs text-red-600">{musicNotaGenError}</div>}
      {(musicNotaGenStatusText || musicNotaGenProgressLog) && (
        <div className="space-y-1">
          {musicNotaGenStatusText && (
            <div className="text-xs text-slate-500">{musicNotaGenStatusText}</div>
          )}
          <pre
            ref={progressRef}
            className="max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap"
          >
            {musicNotaGenProgressLog || 'Waiting for generation output...'}
          </pre>
        </div>
      )}
      {musicNotaGenGeneratedXml && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Generated MusicXML</span>
            <span>Review before applying</span>
          </div>
          <CodeMirrorEditor
            value={musicNotaGenGeneratedXml}
            onChange={(nextValue) => setMusicNotaGenGeneratedXml(nextValue)}
            readOnly={false}
            language="xml"
            placeholderText="Generated MusicXML will appear here."
            height={220}
            maxHeight={320}
            themeMode={codeEditorTheme}
          />
        </div>
      )}
      {musicNotaGenGeneratedAbc && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500">Generated ABC</div>
          <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
            {musicNotaGenGeneratedAbc}
          </pre>
        </div>
      )}
      {musicNotaGenResult && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500">NotaGen Response</div>
          <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
            {JSON.stringify(musicNotaGenResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
