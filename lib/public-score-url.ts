import type { InputFileFormat } from './webmscore-loader';
import { isZipArchive, readZipEntryNames } from './zip-central-directory';

/** Fallback probe window for archives whose central directory cannot be read. */
const TAIL_PROBE_BYTES = 64 * 1024;

const GOOGLE_DRIVE_HOSTS = new Set(['drive.google.com', 'drive.usercontent.google.com']);

const GOOGLE_DRIVE_FILE_ID = /^[A-Za-z0-9_-]+$/;

function getGoogleDriveFileId(url: URL): string | null {
  if (!GOOGLE_DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const pathMatch = url.pathname.match(/^\/file\/d\/([^/]+)/);
  const candidate = pathMatch?.[1] || url.searchParams.get('id');
  return candidate && GOOGLE_DRIVE_FILE_ID.test(candidate) ? candidate : null;
}

export function isGoogleDriveScoreUrl(source: string): boolean {
  try {
    return Boolean(getGoogleDriveFileId(new URL(source)));
  } catch {
    return false;
  }
}

/**
 * Converts a Google Drive share URL into a fetchable URL.
 * Direct browser fetches to drive.usercontent.google.com are blocked by CORS,
 * so we route through our server-side proxy which is allowed to fetch it.
 */
export function resolvePublicScoreUrl(source: string): string {
  try {
    const url = new URL(source);
    const driveFileId = getGoogleDriveFileId(url);
    if (!driveFileId) {
      return source;
    }

    const downloadUrl = new URL('https://drive.usercontent.google.com/download');
    downloadUrl.searchParams.set('id', driveFileId);
    downloadUrl.searchParams.set('export', 'download');

    // In embed/static builds NEXT_PUBLIC_SCORE_EDITOR_API_BASE points to the
    // companion API proxy (e.g. /api/score-editor), which routes to the
    // score_editor_api Next.js service where /api/fetch-score lives.
    const apiBase =
      (process.env.NEXT_PUBLIC_SCORE_EDITOR_API_BASE ?? '').replace(/\/$/, '') || '/api';
    return `${apiBase}/fetch-score?url=${encodeURIComponent(downloadUrl.toString())}`;
  } catch {
    // Relative URLs are valid score sources and should pass through unchanged.
    return source;
  }
}

/**
 * Bounded fallback for archives whose central directory cannot be read: probe only the
 * tail, where the directory would have been, instead of the whole buffer. The old
 * implementation scanned every byte of files that can be tens of megabytes.
 */
function tailContainsAscii(data: Uint8Array, value: string): boolean {
  const window = data.subarray(Math.max(0, data.byteLength - TAIL_PROBE_BYTES));
  if (window.byteLength < value.length) {
    return false;
  }
  const needle = new TextEncoder().encode(value.toLowerCase());
  for (let index = 0; index <= window.byteLength - needle.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      const byte = window[index + offset];
      const lowerByte = byte >= 65 && byte <= 90 ? byte + 32 : byte;
      if (lowerByte !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

/** Detects extensionless downloads (including Google Drive files) from their contents. */
export function detectScoreInputFormat(source: string, data?: Uint8Array): InputFileFormat {
  const normalized = source.toLowerCase().split('#')[0].split('?')[0];
  if (normalized.endsWith('.xml') || normalized.endsWith('.musicxml')) {
    return 'musicxml';
  }
  if (normalized.endsWith('.mxl')) {
    return 'mxl';
  }
  if (normalized.endsWith('.mscx')) {
    return 'mscx';
  }
  if (normalized.endsWith('.mscz')) {
    return 'mscz';
  }

  if (data?.byteLength) {
    if (isZipArchive(data)) {
      // MuseScore 4.x MSCZ files are ZIPs that also contain META-INF/container.xml, so
      // an .mscx entry (the MuseScore signature) decides before the MXL check.
      const entries = readZipEntryNames(data);
      if (entries) {
        if (entries.some((name) => name.toLowerCase().endsWith('.mscx'))) {
          return 'mscz';
        }
        if (entries.some((name) => name.toLowerCase() === 'meta-inf/container.xml')) {
          return 'mxl';
        }
        return 'mscz';
      }
      // Unreadable directory (truncated download, ZIP64): fall back to a tail probe
      // rather than the whole-buffer scan this replaced.
      if (tailContainsAscii(data, '.mscx')) {
        return 'mscz';
      }
      if (tailContainsAscii(data, 'META-INF/container.xml')) {
        return 'mxl';
      }
      return 'mscz';
    }

    const prefix = new TextDecoder()
      .decode(data.subarray(0, Math.min(data.byteLength, 4096)))
      .toLowerCase();
    if (prefix.includes('<musescore')) {
      return 'mscx';
    }
    if (prefix.includes('<score-partwise') || prefix.includes('<score-timewise')) {
      return 'musicxml';
    }
  }

  return 'mscz';
}

/** Builds a clean editor URL at the current deployment path without hard-coding its origin. */
export function buildScoreEditorShareUrl(
  scoreSource: string,
  currentHref: string,
  configuredEditorUrl?: string,
): string {
  const editorUrl = new URL(configuredEditorUrl?.trim() || currentHref);
  editorUrl.search = '';
  editorUrl.hash = '';
  editorUrl.searchParams.set('score', scoreSource);
  return editorUrl.toString();
}
