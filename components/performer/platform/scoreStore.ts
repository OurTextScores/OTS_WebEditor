import type { InputFileFormat } from '../../../lib/webmscore-loader';
import { deviceTable, memoryTable, type Table } from './performDb';

/**
 * A score kept on the device (performer mode, Phase 5): handed over from the editor (`local:<id>`, with its unsaved
 * edits) or a copy of an OTS score made available offline (keyed by its URL).
 */
export interface StoredScore {
  readonly key: string;
  readonly name: string;
  readonly format: InputFileFormat;
  readonly bytes: Uint8Array;
  readonly savedAt: number;
}

export type ScoreStore = Table<StoredScore>;

export const deviceScoreStore = (): ScoreStore =>
  deviceTable<StoredScore>('scores', (score) => score.key);
export const memoryScoreStore = (initial: StoredScore[] = []): ScoreStore =>
  memoryTable<StoredScore>((score) => score.key, initial);

export const isLocalScore = (key: string) => key.startsWith('local:');
export const newLocalKey = () =>
  `local:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
