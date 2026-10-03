import type { MeasureInsertTarget } from './editorProps';

export const LARGE_SCORE_INTERACTION_PRIME_DELAY_MS = 0;

export const LAYOUT_MODES = {
  PAGE: 0,
  FLOAT: 1,
  LINE: 2,
  SYSTEM: 3,
  HORIZONTAL_FIXED: 4,
} as const;

export const measureInsertTargetMap: Record<MeasureInsertTarget, number> = {
  beginning: 2,
  'after-selection': 0,
  end: 3,
};

export const DEFAULT_PAGE_RENDER_TIMEOUT_MS = 45_000;

export const LARGE_PROGRESSIVE_PAGE_RENDER_TIMEOUT_MS = 180_000;

export const PROGRESSIVE_PAGE_LAYOUT_TIMEOUT_MS = 90_000;

export const PROGRESSIVE_PAGE_LAYOUT_CONFIRM_TIMEOUT_MS = 120_000;

export const PROGRESSIVE_PAGE_LAYOUT_EXPAND_TIMEOUT_MS = 300_000;

export const ENGINE_OPERATION_STALL_RELEASE_MS = 600_000;

export const LARGE_SCORE_BACKGROUND_TASK_DELAY_MS = 15_000;

export const LARGE_SCORE_BACKGROUND_TASK_RETRY_DELAY_MS = 5_000;

export const LARGE_SCORE_BACKGROUND_TASK_MAX_RETRIES = 12;
