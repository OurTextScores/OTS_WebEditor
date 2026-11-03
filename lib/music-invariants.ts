/**
 * What a converted score must keep, read from its text per format (lib/music-conversion.ts validation): bars, meter,
 * key, parts, notes, MIDI tracks. Estimates from the markup, not a parse; a value that cannot be read is undefined.
 */
import type { MusicFormat } from './music-conversion';

export function decodeMidiBase64(value: string): Buffer | null {
  const compact = value.replace(/\s+/g, '');
  if (!compact) {
    return null;
  }
  try {
    const bytes = Buffer.from(compact, 'base64');
    if (bytes.length === 0) {
      return null;
    }
    const reencoded = bytes.toString('base64').replace(/=+$/, '');
    const normalizedInput = compact.replace(/=+$/, '');
    if (reencoded !== normalizedInput) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export type InvariantSnapshot = {
  estimatedMeasures?: number;
  meter?: string;
  key?: string;
  partCount?: number;
  noteCount?: number;
  trackCount?: number;
};

function countMusicXmlNotes(text: string): number | undefined {
  const noteBlocks = text.match(/<note\b[\s\S]*?<\/note>/g) || [];
  if (!noteBlocks.length) {
    return undefined;
  }
  const pitched = noteBlocks.filter((block) => !/<rest\b/.test(block));
  return pitched.length || undefined;
}

function countAbcNotes(text: string): number | undefined {
  const body = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (trimmed.startsWith('%')) {
        return false;
      }
      return !/^[A-Za-z]:/.test(trimmed);
    })
    .join('\n')
    // Strip quoted annotations / lyrics in body lines.
    .replace(/"[^"\n]*"/g, ' ')
    // Strip inline field blocks like [K:C], [M:3/4], etc.
    .replace(/\[[A-Za-z]:[^\]]*]/g, ' ');

  const matches =
    body.match(/(?:\^{1,2}|_{1,2}|=)?[A-Ga-g][,']*(?=\d|\/|\s|[|()[\]{}<>.-]|$)/g) || [];
  return matches.length || undefined;
}

function readVarLen(bytes: Buffer, offset: number): { value: number; nextOffset: number } {
  let value = 0;
  let cursor = offset;
  for (let i = 0; i < 4; i += 1) {
    if (cursor >= bytes.length) {
      return { value, nextOffset: bytes.length };
    }
    const byte = bytes[cursor]!;
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor };
    }
  }
  return { value, nextOffset: cursor };
}

function extractMidiInvariantSnapshotFromBytes(bytes: Buffer | null): InvariantSnapshot {
  if (!bytes || bytes.length < 14) {
    return {};
  }
  if (bytes.subarray(0, 4).toString('ascii') !== 'MThd') {
    return {};
  }

  const headerLength = bytes.readUInt32BE(4);
  if (headerLength < 6 || bytes.length < 8 + headerLength) {
    return {};
  }
  const trackCount = bytes.readUInt16BE(10);
  const division = bytes.readUInt16BE(12);

  let offset = 8 + headerLength;
  let noteCount = 0;
  let maxTick = 0;
  let meter: string | undefined;
  let key: string | undefined;

  for (let t = 0; t < trackCount && offset + 8 <= bytes.length; t += 1) {
    if (bytes.subarray(offset, offset + 4).toString('ascii') !== 'MTrk') {
      break;
    }
    const trackLength = bytes.readUInt32BE(offset + 4);
    let cursor = offset + 8;
    const trackEnd = Math.min(bytes.length, cursor + trackLength);
    let runningStatus = 0;
    let absoluteTick = 0;

    while (cursor < trackEnd) {
      const delta = readVarLen(bytes, cursor);
      absoluteTick += delta.value;
      cursor = delta.nextOffset;
      if (cursor >= trackEnd) {
        break;
      }

      let status = bytes[cursor]!;
      if (status < 0x80) {
        if (!runningStatus) {
          break;
        }
        status = runningStatus;
      } else {
        cursor += 1;
        runningStatus = status;
      }

      if (status === 0xff) {
        if (cursor >= trackEnd) {
          break;
        }
        const metaType = bytes[cursor]!;
        cursor += 1;
        const len = readVarLen(bytes, cursor);
        cursor = len.nextOffset;
        const dataEnd = Math.min(trackEnd, cursor + len.value);
        const data = bytes.subarray(cursor, dataEnd);
        cursor = dataEnd;

        if (metaType === 0x58 && data.length >= 2) {
          const numerator = data[0]!;
          const denominator = 2 ** data[1]!;
          meter = `${numerator}/${denominator}`;
        } else if (metaType === 0x59 && data.length >= 1) {
          const sfRaw = data[0]!;
          const fifths = sfRaw > 127 ? sfRaw - 256 : sfRaw;
          key = `fifths:${fifths}`;
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(bytes, cursor);
        cursor = Math.min(trackEnd, len.nextOffset + len.value);
        continue;
      }

      const eventType = status & 0xf0;
      const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
      const dataStart = cursor;
      cursor = Math.min(trackEnd, cursor + dataLength);

      if (eventType === 0x90 && dataStart + 1 < trackEnd) {
        const velocity = bytes[dataStart + 1]!;
        if (velocity > 0) {
          noteCount += 1;
        }
      }
    }

    maxTick = Math.max(maxTick, absoluteTick);
    offset = trackEnd;
  }

  let estimatedMeasures: number | undefined;
  if (division > 0 && meter && maxTick > 0) {
    const [beatsRaw, beatTypeRaw] = meter.split('/');
    const beats = Number(beatsRaw);
    const beatType = Number(beatTypeRaw);
    if (Number.isFinite(beats) && Number.isFinite(beatType) && beats > 0 && beatType > 0) {
      const ticksPerMeasure = beats * ((4 / beatType) * division);
      if (ticksPerMeasure > 0) {
        estimatedMeasures = Math.max(1, Math.round(maxTick / ticksPerMeasure));
      }
    }
  }

  return {
    estimatedMeasures,
    meter,
    key,
    noteCount: noteCount || undefined,
    trackCount: trackCount || undefined,
  };
}

function extractMidiInvariantSnapshot(
  base64Content: string,
  predecodedBytes?: Buffer | null,
): InvariantSnapshot {
  const bytes = predecodedBytes === undefined ? decodeMidiBase64(base64Content) : predecodedBytes;
  return extractMidiInvariantSnapshotFromBytes(bytes);
}

/** MEI (as MuseScore writes MEI Basic): the first meter and key, from staffDef attributes or meterSig/keySig. */
function extractMeiInvariantSnapshot(text: string): InvariantSnapshot {
  const attribute = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();
  const count =
    attribute(/\bmeter\.count="([^"]+)"/) ?? attribute(/<meterSig\b[^>]*\bcount="([^"]+)"/);
  const unit =
    attribute(/\bmeter\.unit="([^"]+)"/) ?? attribute(/<meterSig\b[^>]*\bunit="([^"]+)"/);
  // keysig="2s" (MEI 4: key.sig) is two sharps, "3f" three flats, "0" none: the same as MusicXML's fifths.
  const sig = attribute(/\bkey\.?sig="([^"]+)"/) ?? attribute(/<keySig\b[^>]*\bsig="([^"]+)"/);
  const sigMatch = sig?.match(/^(\d+)([sf]?)$/);
  // A staff without one has no key signature (MuseScore writes none for C major / A minor).
  const fifths = sigMatch
    ? Number(sigMatch[1]) * (sigMatch[2] === 'f' ? -1 : 1)
    : sig === undefined && /<staffDef\b/.test(text)
      ? 0
      : undefined;
  const noteCount = (text.match(/<note\b/g) || []).length;
  return {
    estimatedMeasures: (text.match(/<measure\b/g) || []).length || undefined,
    meter: count && unit ? `${count}/${unit}` : undefined,
    key: fifths !== undefined ? `fifths:${fifths}` : undefined,
    noteCount: noteCount || undefined,
  };
}

/**
 * MNX (JSON): bars from the global measures, the first meter and key, parts, and pitched notes (every object with a
 * pitch, chord members and grace notes included, as MusicXML counts them).
 */
function extractMnxInvariantSnapshot(text: string): InvariantSnapshot {
  let doc: {
    global?: {
      measures?: Array<{ time?: { count?: number; unit?: number }; key?: { fifths?: number } }>;
    };
    parts?: unknown[];
  };
  try {
    doc = JSON.parse(text);
  } catch {
    return {};
  }
  const measures = doc.global?.measures ?? [];
  const time = measures.find((m) => m.time)?.time;
  const key = measures.find((m) => m.key)?.key;
  let noteCount = 0;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if ('pitch' in value) noteCount++;
      Object.values(value).forEach(visit);
    }
  };
  visit(doc.parts);
  return {
    estimatedMeasures: measures.length || undefined,
    meter: time?.count && time?.unit ? `${time.count}/${time.unit}` : undefined,
    // No key in the first measures is no key signature, as for MEI.
    key: `fifths:${key?.fifths ?? 0}`,
    partCount: doc.parts?.length || undefined,
    noteCount: noteCount || undefined,
  };
}

export function extractInvariantSnapshot(
  format: MusicFormat,
  content: string,
  options?: { midiBytes?: Buffer | null },
): InvariantSnapshot {
  const text = content.trim();
  if (!text) {
    return {};
  }

  if (format === 'abc') {
    const bodyLines = text.split('\n').filter((line) => !/^[A-Za-z]:/.test(line.trim()));
    const barMatches = bodyLines.join('\n').match(/\|/g) || [];
    const meter = text.match(/(^|\n)M:\s*([^\n]+)/m)?.[2]?.trim();
    const key = text.match(/(^|\n)K:\s*([^\n]+)/m)?.[2]?.trim();
    return {
      estimatedMeasures:
        barMatches.length > 0 ? Math.max(1, Math.floor(barMatches.length / 2)) : undefined,
      meter,
      key,
      noteCount: countAbcNotes(text),
    };
  }

  if (format === 'midi') {
    return extractMidiInvariantSnapshot(text, options?.midiBytes);
  }

  if (format === 'mei') {
    return extractMeiInvariantSnapshot(text);
  }

  if (format === 'mnx') {
    return extractMnxInvariantSnapshot(text);
  }

  const measureCount = (text.match(/<measure\b/g) || []).length || undefined;
  const partCount = (text.match(/<score-part\b/g) || []).length || undefined;
  const beats = text.match(/<beats>\s*([^<]+)\s*<\/beats>/)?.[1]?.trim();
  const beatType = text.match(/<beat-type>\s*([^<]+)\s*<\/beat-type>/)?.[1]?.trim();
  const meter = beats && beatType ? `${beats}/${beatType}` : undefined;
  const fifths = text.match(/<fifths>\s*([-+]?\d+)\s*<\/fifths>/)?.[1]?.trim();
  return {
    estimatedMeasures: measureCount,
    meter,
    key: fifths !== undefined ? `fifths:${fifths}` : undefined,
    partCount,
    noteCount: countMusicXmlNotes(text),
  };
}
