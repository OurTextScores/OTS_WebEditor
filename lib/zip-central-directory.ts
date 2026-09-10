/**
 * Minimal ZIP central-directory reader, for identifying an archive by its entry names.
 *
 * Replaces a whole-buffer substring scan (SECURITY_CORRECTNESS_FINDINGS L4). That scan
 * was wrong in two ways at once: it walked every byte of a file that can be tens of
 * megabytes, twice in the worst case and on the main thread, and it matched a needle
 * anywhere in the archive — so an MXL containing an entry merely *named* something like
 * `my.mscx.notes/score.xml`, or any file whose compressed bytes happened to spell
 * `.mscx`, was identified as MuseScore.
 *
 * A ZIP's central directory lives at the end of the file and lists every entry by name.
 * Reading it is bounded work and gives exact names, which fixes both problems.
 *
 * Deliberately not a ZIP library: no decompression, no extraction, no ZIP64. Anything it
 * cannot parse confidently returns null so the caller can fall back.
 */

/** `PK\x05\x06` — end of central directory. */
const EOCD_SIGNATURE = 0x06054b50;
/** `PK\x01\x02` — a central directory file header. */
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
/** The EOCD sits within 22 bytes + a comment of at most 64 KB of the end. */
const MAX_EOCD_SEARCH = EOCD_MIN_SIZE + 0xffff;
const CENTRAL_HEADER_SIZE = 46;
/** ZIP64 marks these fields as "look elsewhere"; this reader does not follow. */
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP64_SENTINEL_16 = 0xffff;

export function isZipArchive(data: Uint8Array): boolean {
  return data.byteLength >= 2 && data[0] === 0x50 && data[1] === 0x4b;
}

/**
 * Entry names from the archive's central directory, or null when the directory cannot be
 * read — a truncated download, a ZIP64 archive, or bytes that only look like a ZIP.
 */
export function readZipEntryNames(data: Uint8Array): string[] | null {
  if (!isZipArchive(data) || data.byteLength < EOCD_MIN_SIZE) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const searchFloor = Math.max(0, data.byteLength - MAX_EOCD_SEARCH);
  let eocd = -1;
  for (let index = data.byteLength - EOCD_MIN_SIZE; index >= searchFloor; index -= 1) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    return null;
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (
    entryCount === ZIP64_SENTINEL_16 ||
    directorySize === ZIP64_SENTINEL_32 ||
    directoryOffset === ZIP64_SENTINEL_32 ||
    directoryOffset + directorySize > data.byteLength
  ) {
    return null;
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const names: string[] = [];
  let cursor = directoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (cursor + CENTRAL_HEADER_SIZE > data.byteLength) {
      return null;
    }
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) {
      return null;
    }
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameStart = cursor + CENTRAL_HEADER_SIZE;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > data.byteLength) {
      return null;
    }
    names.push(decoder.decode(data.subarray(nameStart, nameEnd)));
    cursor = nameEnd + extraLength + commentLength;
  }

  return names;
}
