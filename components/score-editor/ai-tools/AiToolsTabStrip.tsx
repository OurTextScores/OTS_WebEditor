/**
 * The AI tools sidebar's status line and tab strip.
 *
 * Presentational: it reports checkpoint/loading status and switches tabs. The tab
 * union is declared here, next to the buttons that produce it, and ScoreEditor imports
 * it back so the two cannot drift.
 */
export type AiToolsTab =
  'assistant' | 'notagen' | 'transcoda' | 'multitrack' | 'harmony' | 'functional' | 'mma';

export type AiToolsTabStripProps = {
  activeTab: AiToolsTab;
  setActiveTab: (tab: AiToolsTab) => void;
  /** Assistant-backed tabs are hidden entirely when AI is not configured. */
  aiEnabled: boolean;
  status: {
    checkpointCount: number;
    dirtySinceCheckpoint: boolean;
    loading: boolean;
  };
};

export function AiToolsTabStrip({
  activeTab,
  setActiveTab,
  aiEnabled,
  status,
}: AiToolsTabStripProps) {
  // Single mapping column; the JSX below is the moved block.
  const xmlSidebarTab = activeTab;
  const setXmlSidebarTab = setActiveTab;
  const checkpointCount = status.checkpointCount;
  const scoreDirtySinceCheckpoint = status.dirtySinceCheckpoint;
  const xmlLoading = status.loading;

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {checkpointCount === 0
            ? 'No checkpoint yet'
            : scoreDirtySinceCheckpoint
              ? 'Unsaved score changes'
              : ''}
        </span>
        {xmlLoading && <span>Loading...</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-y-2 text-xs font-medium text-gray-600">
        <div className="flex flex-wrap gap-2">
          {aiEnabled && (
            <button
              type="button"
              data-testid="tab-ai"
              onClick={() => setXmlSidebarTab('assistant')}
              className={`rounded border px-2 py-1 ${
                xmlSidebarTab === 'assistant'
                  ? 'border-gray-400 bg-gray-100 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assistant
            </button>
          )}
          {aiEnabled && (
            <button
              type="button"
              data-testid="tab-notagen"
              onClick={() => setXmlSidebarTab('notagen')}
              className={`rounded border px-2 py-1 ${
                xmlSidebarTab === 'notagen'
                  ? 'border-gray-400 bg-gray-100 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              NotaGen
            </button>
          )}
          <button
            type="button"
            data-testid="tab-transcoda"
            onClick={() => setXmlSidebarTab('transcoda')}
            className={`rounded border px-2 py-1 ${
              xmlSidebarTab === 'transcoda'
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Transcoda
          </button>
          <button
            type="button"
            data-testid="tab-multitrack-vae"
            onClick={() => setXmlSidebarTab('multitrack')}
            className={`rounded border px-2 py-1 ${
              xmlSidebarTab === 'multitrack'
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            MusicVAE
          </button>
          <button
            type="button"
            data-testid="tab-harmony"
            onClick={() => setXmlSidebarTab('harmony')}
            className={`rounded border px-2 py-1 ${
              xmlSidebarTab === 'harmony'
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Chordify
          </button>
          <button
            type="button"
            data-testid="tab-functional-harmony"
            onClick={() => setXmlSidebarTab('functional')}
            className={`rounded border px-2 py-1 ${
              xmlSidebarTab === 'functional'
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Harmony
          </button>
          <button
            type="button"
            data-testid="tab-mma"
            onClick={() => setXmlSidebarTab('mma')}
            className={`rounded border px-2 py-1 ${
              xmlSidebarTab === 'mma'
                ? 'border-gray-400 bg-gray-100 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            MMA
          </button>
        </div>
      </div>
    </div>
  );
}
