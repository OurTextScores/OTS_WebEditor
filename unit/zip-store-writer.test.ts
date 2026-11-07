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
      // unzip -t checks every entry's CRC
      expect(execFileSync('unzip', ['-t', file], { encoding: 'utf8' })).toContain(
        'No errors detected',
      );
      // Another reader sees the UTF-8 names: Python's zipfile, answering in ASCII-escaped JSON so the terminal's
      // encoding cannot get in the way. (unzip itself matches non-ASCII names by its build and locale: CI's could not
      // find 'Violoncelle é.pdf' that a local unzip found.)
      const names = JSON.parse(
        execFileSync(
          'python3',
          ['-c', 'import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', file],
          { encoding: 'utf8' },
        ),
      );
      expect(names).toEqual(entries.map((entry) => entry.name));
      // -p prints that entry's bytes, chosen with an ASCII pattern
      expect(execFileSync('unzip', ['-p', file, 'Violoncelle*'], { encoding: 'utf8' })).toBe('%PDF-1.4 cello');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
