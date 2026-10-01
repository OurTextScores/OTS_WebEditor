import { PanelRightClose } from 'lucide-react';
import { CodeMirrorEditor, type CodeEditorThemeMode } from '../CodeMirrorEditor';

/**
 * Theme choices offered by the source editor. Declared here with the <select> that
 * renders them; ScoreEditor imports it back to validate stored values, so there is one
 * list rather than two that can disagree about which themes exist.
 */
export const CODE_EDITOR_THEME_OPTIONS: Array<{ value: CodeEditorThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'light-contrast', label: 'Light High Contrast' },
  { value: 'dark', label: 'Dark' },
  { value: 'dark-contrast', label: 'Dark High Contrast' },
];

/**
 * The MusicXML source panel: view and edit the score's MusicXML, apply it back, or
 * reload it from the engine.
 *
 * Presentational: the owner reads and writes the score, and decides when applying or
 * reloading is allowed.
 */
export type MusicXmlPanelProps = {
  text: string;
  setText: (value: string) => void;
  setDirty: (value: boolean) => void;
  layout: {
    /** CSS lengths ('45vh'), not pixel counts. */
    editorHeight: string;
    editorMaxHeight: string;
  };
  /** Whether a score is loaded, which only changes the placeholder text. */
  scoreLoaded: boolean;
  permissions: {
    applyEnabled: boolean;
    applyDisabled: boolean;
    reloadEnabled: boolean;
    controlsDisabled: boolean;
  };
  theme: {
    mode: CodeEditorThemeMode;
    setMode: (value: CodeEditorThemeMode) => void;
  };
  actions: {
    apply: () => void;
    refresh: () => void;
    close: () => void;
  };
  /** Content only, for the v2 shell's docked Panel, which supplies the chrome. */
  embedded?: boolean;
};

export function MusicXmlPanel({
  embedded = false,
  text,
  setText,
  setDirty,
  scoreLoaded,
  layout,
  permissions,
  theme,
  actions,
}: MusicXmlPanelProps) {
  // Single mapping column; the JSX below is the moved block.
  const xmlText = text;
  const setXmlText = setText;
  const setXmlDirty = setDirty;
  const score = scoreLoaded;

  const xmlEditorHeight = layout.editorHeight;
  const xmlEditorMaxHeight = layout.editorMaxHeight;

  const xmlApplyEnabled = permissions.applyEnabled;
  const xmlApplyDisabled = permissions.applyDisabled;
  const xmlReloadEnabled = permissions.reloadEnabled;
  const xmlControlsDisabled = permissions.controlsDisabled;

  const codeEditorTheme = theme.mode;
  const setCodeEditorTheme = theme.setMode;

  const handleApplyXmlEdits = actions.apply;
  const handleRefreshXml = actions.refresh;

  const body = (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
      <div className="flex items-center justify-end pb-2">
        <label className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">Theme</span>
          <select
            value={codeEditorTheme}
            onChange={(event) => setCodeEditorTheme(event.target.value as CodeEditorThemeMode)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
            data-testid="select-musicxml-theme"
          >
            {CODE_EDITOR_THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="btn-xml-apply"
          onClick={handleApplyXmlEdits}
          disabled={xmlApplyDisabled}
          title="Applying edits will auto-checkpoint if the score has unsaved changes."
          className={`flex-1 rounded border px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
            xmlApplyEnabled
              ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-gray-300 bg-white text-gray-700'
          }`}
        >
          Apply edits
        </button>
        <button
          type="button"
          data-testid="btn-xml-reload"
          onClick={handleRefreshXml}
          disabled={!xmlReloadEnabled}
          title={
            xmlReloadEnabled
              ? 'The score has changed, reload to update XML. Any XML changes will be lost on update.'
              : undefined
          }
          className={`flex-1 rounded border px-3 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
            xmlReloadEnabled
              ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
              : 'border-gray-300 bg-white text-gray-700'
          }`}
        >
          Reload
        </button>
      </div>
      <div className="mt-2">
        <CodeMirrorEditor
          testId="xml-editor"
          value={xmlText}
          onChange={(nextValue) => {
            setXmlText(nextValue);
            setXmlDirty(true);
          }}
          readOnly={xmlControlsDisabled}
          placeholderText={score ? 'MusicXML will appear here.' : 'Load a score to view MusicXML.'}
          language="xml"
          height={xmlEditorHeight}
          maxHeight={xmlEditorMaxHeight}
          themeMode={codeEditorTheme}
        />
      </div>
    </div>
  );

  // Docked in the v2 shell the Panel supplies the chrome, title and close button.
  if (embedded) {
    return (
      <div data-testid="musicxml-sidebar" className="flex min-h-0 flex-1 flex-col pt-3">
        {body}
      </div>
    );
  }

  return (
    <aside
      style={{ width: 384 }}
      className="flex shrink-0 border-l bg-white text-sm"
      data-testid="musicxml-sidebar"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            MusicXML
          </span>
          <button
            type="button"
            data-testid="btn-musicxml-toggle"
            aria-expanded
            aria-label="Close MusicXML sidebar"
            title="Close MusicXML sidebar"
            onClick={actions.close}
            className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
        {body}
      </div>
    </aside>
  );
}
