import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Managing parts (roadmap E18, slice 4), through the Node build (scripts/part-management-probe.mjs). The Node build is a
// local artefact (webmscore-fork/web-public, untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

function probe(): Record<string, unknown> {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'part-management-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/part-management-probe.mjs')], {
      cwd: root,
      stdio: ['ignore', fd, 'pipe'],
      timeout: 120_000,
    });
    return JSON.parse(fs.readFileSync(output, 'utf8').trim().split('\n').pop() ?? '{}');
  } finally {
    fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!fs.existsSync(nodeBuild))('managing parts in the engine', () => {
  const report = fs.existsSync(nodeBuild) ? probe() : {};

  it("creates a part from the score's instruments, in score order, with a unique name", () => {
    expect(report.generated).toEqual(['Violin', 'Cello']);
    expect(report.created).toBe(2);
    expect((report.afterCreate as unknown[])[2]).toEqual({
      name: 'Strings',
      instruments: ['Violin', 'Cello'],
      partIndices: [0, 1],
    });
    expect(report.createNone).toBe(-1);
    expect(report.createOffScore).toBe(-1);
    expect(report.afterTaken).toEqual(['Violin', 'Cello', 'Strings', 'Violin (1)']);
  });

  it('renames a part, refusing an empty name or one another part has', () => {
    expect(report.renameEmpty).toBe(false);
    expect(report.renameTaken).toBe(false);
    expect(report.renamed).toBe(true);
    expect(report.afterRename).toEqual(['Violin', 'Cello', 'Strings duo']);
  });

  it('duplicates a part after it, and resets a part in place, dropping its own style', () => {
    expect(report.duplicated).toBe(1);
    expect(report.afterDuplicate).toEqual(['Violin', 'Violin (copy)', 'Cello', 'Strings duo']);
    expect(report.reset).toBe(true);
    expect(report.resetStyle).toEqual({ before: 9, after: 6.5 });
    expect(report.afterReset).toEqual(report.afterDuplicate);
  });

  it('deletes a part as an undoable edit', () => {
    expect(report.removed).toBe(true);
    expect(report.afterRemove).toEqual(['Violin', 'Cello', 'Strings duo']);
    expect(report.afterUndo).toEqual(['Violin', 'Violin (copy)', 'Cello', 'Strings duo']);
  });

  it('puts parts back as part of loading, with no undo step, skipping one with no instrument on the score', () => {
    expect(report.restored).toBe(2);
    expect(report.afterRestore).toEqual([
      { name: 'Cello', instruments: ['Cello'], partIndices: [1] },
      { name: 'Duo', instruments: ['Violin', 'Cello'], partIndices: [0, 1] },
    ]);
    expect(report.restoreUndoSize).toBe(0);
  });
});
