export type BrowserScoreMetadata = {
  title?: unknown;
  subtitle?: unknown;
  composer?: unknown;
  parts?: Array<{ isVisible?: unknown }>;
};

export type BrowserScoreHandle = {
  saveXml?: () => Promise<string>;
  saveMsc?: (format: 'mscx' | 'mscz') => Promise<Uint8Array>;
  metadata?: () => Promise<BrowserScoreMetadata>;
  subtitle?: () => Promise<string>;
  getKeySignature?: () => Promise<number> | number;
  measurePositions?: () => Promise<{ elements: Array<{ page: number }> }>;
  addNoteFromRest?: (...args: unknown[]) => Promise<unknown>;
  listInstrumentTemplates?: (...args: unknown[]) => Promise<unknown>;
  setSoundFont?: (bytes: Uint8Array) => Promise<void> | void;
  saveAudio?: (format: 'wav') => Promise<Uint8Array>;
  playbackTimeline?: () => Promise<{
    schemaVersion: 1;
    durationMs: number;
    renderDurationMs: number;
    occurrences: Array<{
      occurrenceIndex: number;
      measureIndex: number;
      startMs: number;
      endMs: number;
    }>;
  } | null>;
};

export type BrowserScoreWindow = typeof window & {
  __webmscore?: BrowserScoreHandle;
};
