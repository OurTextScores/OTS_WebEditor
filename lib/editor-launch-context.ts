export type EditorLaunchContext = {
  source?: string;
  workId?: string;
  sourceId?: string;
  revisionId?: string;
  sourceType?: string;
  sourceLabel?: string;
  workTitle?: string;
  composer?: string;
  imslpUrl?: string;
  canonicalXmlUrl?: string;
};

const FIELD_LIMITS: Record<keyof EditorLaunchContext, number> = {
  source: 64,
  workId: 128,
  sourceId: 128,
  revisionId: 128,
  sourceType: 64,
  sourceLabel: 256,
  workTitle: 512,
  composer: 256,
  imslpUrl: 2048,
  canonicalXmlUrl: 4096,
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const readBoundedString = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, maxLength);
};

export function sanitizeEditorLaunchContext(value: unknown): EditorLaunchContext | null {
  const data = asRecord(value);
  if (!data) {
    return null;
  }

  const next: EditorLaunchContext = {};
  (Object.keys(FIELD_LIMITS) as Array<keyof EditorLaunchContext>).forEach((key) => {
    const normalized = readBoundedString(data[key], FIELD_LIMITS[key]);
    if (normalized) {
      next[key] = normalized;
    }
  });

  return Object.keys(next).length > 0 ? next : null;
}

export function parseEditorLaunchContextParam(value: string | null | undefined): EditorLaunchContext | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return sanitizeEditorLaunchContext(JSON.parse(value));
  } catch {
    return null;
  }
}

export function stringifyEditorLaunchContext(value: unknown): string {
  const sanitized = sanitizeEditorLaunchContext(value);
  return sanitized ? JSON.stringify(sanitized) : '';
}
