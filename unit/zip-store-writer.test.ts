import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZipEntryNames } from '../lib/zip-central-directory';
import { crc32, zipStore } from '../lib/zip-store-writer';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('ZIP of stored files (roadmap E18 part export)', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes an archive other tools read, with UTF-8 names and the bytes intact', () => {
    const entries = [
      { name: 'Score.pdf', data: bytes('%PDF-1.4 score') },
      { name: 'Violoncelle é.pdf', data: bytes('%PDF-1.4 cello') },
      { name: 'empty.txt', data: new Uint8Array() },
    ];
    const archive = zipStore(entries);
    expect(readZipEntryNames(archive)).toEqual(entries.map((entry) => entry.name));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-store-'));
    try {
      const file = path.join(dir, 'parts.zip');
      fs.writeFileSync(file, archive);
      // unzip -t checks every entry's CRC; -p prints one entry's bytes
      expect(execFileSync('unzip', ['-t', file], { encoding: 'utf8' })).toContain(
        'No errors detected',
      );
      expect(execFileSync('unzip', ['-p', file, 'Violoncelle é.pdf'], { encoding: 'utf8' })).toBe(
        '%PDF-1.4 cello',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
