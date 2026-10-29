import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Typed element properties by MuseScore property name (roadmap E09/E07/E10), through the Node build
// (scripts/element-properties-probe.mjs). The Node build is a local artefact (webmscore-fork/web-public,
// untracked), so this suite skips where it is absent.

const root = path.resolve(__dirname, '..');
const nodeBuild = path.join(root, 'webmscore-fork/web-public/webmscore.nodejs.cjs');

interface PropertyState {
  value: string | null;
  default: string;
  mixed: boolean;
  applicableCount: number;
}
type Report = Record<string, boolean | Record<string, PropertyState>> & {
  before: Record<string, PropertyState>;
  afterReset: Record<string, PropertyState>;
  undone: Record<string, PropertyState>;
};

function probe(): Report {
  // The engine's Node build expects stdout to be a file or pipe, not the socket Node uses for child-process pipes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'element-properties-'));
  const output = path.join(dir, 'report.txt');
  const fd = fs.openSync(output, 'w');
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts/element-properties-probe.mjs')], {
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

describe.skipIf(!fs.existsSync(nodeBuild))('typed element properties in the engine', () => {
  const report = (fs.existsSync(nodeBuild) ? probe() : {}) as Report;

  it('makes an ornament symbol an Ornament, with the 4.1+ ornament properties and their defaults', () => {
    expect(report.ornamentAdded).toBe(true);
    expect(report.before).toMatchObject({
      intervalAbove: { value: 'second,auto', default: 'second,auto', mixed: false, applicableCount: 1 },
      ornamentShowAccidental: { value: 'default' },
      ornamentShowCueNote: { value: 'auto' },
      startOnUpperNote: { value: 'false' },
    });
  });

  it('reports a property only for the selected elements that have it, and leaves unknown names out', () => {
    expect(report.before.voiceAssignment).toMatchObject({ value: 'allInInstrument', applicableCount: 2 });
    expect(report.before.centerOnNotehead).toMatchObject({ applicableCount: 1 });
    expect(report.before).not.toHaveProperty('noSuchProperty');
  });

  it('sets a property by engine token on every element that has it, refusing bad tokens and names', () => {
    expect(report.setInterval).toBe(true);
    expect(report.setVoice).toBe(true);
    expect(report.rejected).toBe(false);
    expect(report.unknown).toBe(false);
    expect(report.after).toMatchObject({
      intervalAbove: { value: 'third,minor' },
      voiceAssignment: { value: 'currentVoiceOnly', applicableCount: 2 },
    });
  });

  it('resets a property to its default, undoably', () => {
    expect(report.reset).toBe(true);
    expect(report.afterReset.intervalAbove.value).toBe('second,auto');
    expect(report.undone.intervalAbove.value).toBe('third,minor');
  });

  it('toggles parentheses on the selected note (E14), as MusicXML shows', () => {
    expect(report).toMatchObject({
      parenthesesOn: true,
      parenthesizedInXml: 1,
      parenthesesOff: true,
      parenthesizedAfterToggle: 0,
    });
  });
});
