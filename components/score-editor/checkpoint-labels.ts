export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

export const formatTimestamp = (timestamp: number) => new Date(timestamp).toLocaleString();

export const buildCheckpointTitle = (label: string, fallbackTitle: string) => {
  const trimmed = label.trim();
  if (trimmed) {
    return trimmed;
  }
  const base = fallbackTitle.trim() || 'Untitled Score';
  return `${base} ${formatTimestamp(Date.now())}`;
};

export const toSafeFilename = (name: string) => {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'checkpoint';
};
