#!/usr/bin/env node
// Resumable Playwright runs: one spec file at a time, a progress line after each, results kept on disk.
//
//   node scripts/playwright-resumable.mjs --run <name> [options] [spec files...]
//
// Options:
//   --specs-file <file>   spec paths, one per line (in addition to positional specs)
//   --cwd <dir>           repository to run in (default: this one), e.g. ../OurTextScores
//   --config <file>       Playwright config, relative to --cwd
//   --project <name>      Playwright project
//   --rerun-failed        also rerun specs whose recorded result has failures
//   --fresh               discard the run's ledger and start over
//   --spec-timeout <s>    wall-clock limit per spec file (default 3600)
//
// Results live in <cwd>/.playwright-runs/<name>/ (git-ignored): ledger.jsonl (one line per finished spec),
// logs/<spec>.log (Playwright's line reporter), artifacts/<spec>/ (failure screenshots and error-context.md;
// Playwright clears test-results/ on every run, so it cannot hold these). Rerunning the same command resumes:
// specs already in the ledger are skipped. Browser and server settings come from the environment as usual
// (PLAYWRIGHT_BROWSER, PLAYWRIGHT_PORT, PLAYWRIGHT_FIREFOX_EXECUTABLE, ...).
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};

const runName = option('--run');
const specsFile = option('--specs-file');
const cwd = path.resolve(option('--cwd') ?? process.cwd());
const config = option('--config');
const project = option('--project');
const specTimeoutS = Number(option('--spec-timeout') ?? 3600);
const rerunFailed = flag('--rerun-failed');
const fresh = flag('--fresh');
if (!runName || !/^[\w.-]+$/.test(runName)) {
  console.error('Usage: playwright-resumable.mjs --run <name> [options] [spec files...]');
  process.exit(2);
}
const specs = [
  ...args,
  ...(specsFile
    ? readFileSync(specsFile, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : []),
];
if (specs.length === 0) {
  console.error('No spec files given.');
  process.exit(2);
}

const runDir = path.join(cwd, '.playwright-runs', runName);
const ledgerPath = path.join(runDir, 'ledger.jsonl');
if (fresh) rmSync(runDir, { recursive: true, force: true });
mkdirSync(path.join(runDir, 'logs'), { recursive: true });

/** Latest recorded result per spec. */
const ledger = new Map();
if (existsSync(ledgerPath)) {
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      ledger.set(entry.spec, entry);
    } catch {
      /* a line cut short by a crash: that spec simply runs again */
    }
  }
}

const slug = (spec) => spec.replace(/[^\w.-]+/g, '_');
const stamp = () => new Date().toISOString().slice(11, 19);

function runSpec(spec) {
  const log = path.join(runDir, 'logs', `${slug(spec)}.log`);
  const json = path.join(runDir, 'logs', `${slug(spec)}.json`);
  const commandArgs = [
    'playwright',
    'test',
    spec,
    '--reporter=line,json',
    `--output=${path.join(runDir, 'artifacts', slug(spec))}`,
  ];
  if (config) commandArgs.push('-c', config);
  if (project) commandArgs.push(`--project=${project}`);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('npx', commandArgs, {
      cwd,
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: json, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    writeFileSync(log, '');
    const sink = (chunk) => appendFileSync(log, chunk);
    child.stdout.on('data', sink);
    child.stderr.on('data', sink);
    const timer = setTimeout(() => child.kill('SIGTERM'), specTimeoutS * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let stats = null;
      try {
        stats = JSON.parse(readFileSync(json, 'utf8')).stats;
      } catch {
        /* no JSON: the run did not get as far as reporting */
      }
      resolve({
        spec,
        passed: stats?.expected ?? 0,
        failed: stats?.unexpected ?? (code === 0 ? 0 : 1),
        flaky: stats?.flaky ?? 0,
        skipped: stats?.skipped ?? 0,
        exitCode: code,
        signal: signal ?? undefined,
        timedOut: signal === 'SIGTERM' && Date.now() - started >= specTimeoutS * 1000,
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
        browser: process.env.PLAYWRIGHT_BROWSER ?? project ?? 'chromium',
      });
    });
  });
}

const todo = specs.filter((spec) => {
  const done = ledger.get(spec);
  return !done || (rerunFailed && (done.failed > 0 || done.exitCode !== 0));
});
console.log(
  `[${stamp()}] run ${runName}: ${specs.length} specs, ${specs.length - todo.length} already recorded, ${todo.length} to run (${runDir})`,
);
let index = 0;
for (const spec of todo) {
  index += 1;
  const result = await runSpec(spec);
  appendFileSync(ledgerPath, JSON.stringify(result) + '\n');
  ledger.set(spec, result);
  const status = result.failed > 0 || result.exitCode !== 0 ? 'FAIL' : 'ok  ';
  console.log(
    `[${stamp()}] ${status} ${index}/${todo.length} ${spec}: ${result.passed} passed, ${result.failed} failed, ` +
      `${result.flaky} flaky, ${result.skipped} skipped (${(result.durationMs / 1000).toFixed(0)}s)` +
      (result.timedOut ? ' TIMED OUT' : ''),
  );
}

const all = specs.map((spec) => ledger.get(spec)).filter(Boolean);
const total = (key) => all.reduce((sum, entry) => sum + (entry[key] ?? 0), 0);
const failing = all.filter((entry) => entry.failed > 0 || entry.exitCode !== 0);
console.log(
  `[${stamp()}] run ${runName} totals: ${total('passed')} passed, ${total('failed')} failed, ${total('flaky')} flaky, ` +
    `${total('skipped')} skipped across ${all.length}/${specs.length} specs`,
);
for (const entry of failing)
  console.log(
    `  failing: ${entry.spec} (log: ${path.join(runDir, 'logs', `${slug(entry.spec)}.log`)})`,
  );
process.exit(failing.length > 0 ? 1 : 0);
