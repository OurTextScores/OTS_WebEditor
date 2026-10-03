import type { CompareSide } from './compare/compare-types';
import type { PerfHandle } from '../../lib/perf-trace';
import { Score } from '../../lib/webmscore-loader';
import type { SynthAudioBatchIterator } from '../../lib/webmscore-loader';

export type SynthBatchIterator = SynthAudioBatchIterator;

export type EditorTraceContext = {
  requestId?: string;
  traceId?: string;
};

export type EditorTelemetryCounters = {
  documentsLoaded: number;
  documentLoadFailures: number;
  aiRequests: number;
  aiFailures: number;
  patchApplies: number;
  patchApplyFailures: number;
};

export type ApplyXmlToScore = (
  sourceXml: string,
  options?: {
    telemetrySource?: string;
    inputFormat?: string;
    enforceJazzHarmonyStyle?: boolean;
  },
) => Promise<boolean>;

export type StopCompareSideAudio = (
  side: CompareSide,
  options?: { awaitCancel?: boolean },
) => Promise<void>;

export type HandleUrlLoad = (url: string, signal?: AbortSignal) => Promise<boolean>;

export type HandleFileUploadOptions = {
  preserveScoreId?: boolean;
  scoreIdOverride?: string;
  updateUrl?: boolean;
  createInitialCheckpoint?: boolean;
  telemetrySource?: string;
};

export type HandleFileUpload = (file: File, options?: HandleFileUploadOptions) => Promise<boolean>;

export type RefreshPageCount = (targetScore: Score, preferredPage?: number) => Promise<number>;

export type RenderScore = (
  currentScore: Score,
  pageIndex?: number,
  highlightSelection?: boolean,
  perf?: PerfHandle,
) => Promise<boolean>;

export type EnsureSoundFontLoaded = (
  targetScore?: Score,
  options?: { forceRetry?: boolean },
) => Promise<boolean>;

export interface InstrumentTemplate {
  id: string;
  name: string;
  groupId?: string;
  groupName?: string;
  familyId?: string;
  familyName?: string;
  staffCount?: number;
  isExtended?: boolean;
}

export interface InstrumentTemplateGroup {
  id: string;
  name: string;
  instruments: InstrumentTemplate[];
}

export interface PartSummary {
  index: number;
  name: string;
  instrumentName: string;
  instrumentId: string;
  isVisible: boolean;
}
