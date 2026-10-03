import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRatchetDirection } from './ratchet-direction.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checkBudget = process.argv.includes('--check');
const jsonOutput = process.argv.includes('--json');
const budgetPath = 'scripts/technical-debt-budget.json';
const budget = JSON.parse(readFileSync(resolve(root, budgetPath), 'utf8'));

const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

/**
 * The ref the budget file is compared against to detect a raise. A PR is judged against
 * its target branch, so a raise anywhere in the branch must be declared; locally the
 * last commit is the useful comparison, which catches a raise before it is committed.
 */
const resolveBaseRef = () => {
  const explicit = process.argv.indexOf('--base');
  if (explicit >= 0 && process.argv[explicit + 1]) return process.argv[explicit + 1];
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  if (git(['rev-parse', '--verify', '--quiet', 'origin/main']).status === 0) return 'origin/main';
  return 'HEAD';
};
const ownedRoots = ['app', 'components', 'lib', 'unit', 'tests'];

const readOwnedFiles = () => {
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const entryPath = resolve(path, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
  };
  for (const ownedRoot of ownedRoots) visit(resolve(root, ownedRoot));
  return files;
};

const gitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
});
const baseCommit = gitResult.status === 0 ? gitResult.stdout.trim() : 'unknown';

const scoreEditorPath = resolve(root, 'components/ScoreEditor.tsx');
const scoreEditorText = readFileSync(scoreEditorPath, 'utf8');
const scoreEditor = {
  lines: (scoreEditorText.match(/\n/g) || []).length,
  bytes: statSync(scoreEditorPath).size,
};

const eslintPath = resolve(root, 'node_modules/eslint/bin/eslint.js');
const eslintResult = spawnSync(process.execPath, [eslintPath, ...ownedRoots, '--format', 'json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

if (eslintResult.status !== 0 && eslintResult.status !== 1) {
  process.stderr.write(eslintResult.stderr || eslintResult.stdout || 'ESLint audit failed.\n');
  process.exit(1);
}

let eslintRows;
try {
  eslintRows = JSON.parse(eslintResult.stdout);
} catch (error) {
  process.stderr.write(eslintResult.stderr);
  console.error('Unable to parse ESLint JSON output:', error);
  process.exit(1);
}

const ruleCounts = new Map();
let eslintErrors = 0;
let eslintWarnings = 0;
let filesWithFindings = 0;

for (const row of eslintRows) {
  eslintErrors += row.errorCount;
  eslintWarnings += row.warningCount;
  if (row.errorCount > 0 || row.warningCount > 0) filesWithFindings += 1;
  for (const message of row.messages) {
    const rule = message.ruleId || 'unclassified';
    const counts = ruleCounts.get(rule) || { errors: 0, warnings: 0 };
    if (message.severity === 2) counts.errors += 1;
    if (message.severity === 1) counts.warnings += 1;
    ruleCounts.set(rule, counts);
  }
}

const topRules = [...ruleCounts.entries()]
  .map(([rule, counts]) => ({ rule, ...counts }))
  .sort((a, b) => b.errors + b.warnings - (a.errors + a.warnings))
  .slice(0, 10);
const topFiles = eslintRows
  .filter((row) => row.errorCount > 0 || row.warningCount > 0)
  .sort((a, b) => b.errorCount + b.warningCount - (a.errorCount + a.warningCount))
  .slice(0, 10)
  .map((row) => ({
    file: relative(root, row.filePath),
    errors: row.errorCount,
    warnings: row.warningCount,
  }));

const ownedFiles = readOwnedFiles();
let unconditionalSkips = 0;
let localSuppressionDirectives = 0;
for (const file of ownedFiles) {
  const source = readFileSync(file, 'utf8');
  unconditionalSkips += (source.match(/\b(?:test|it|describe)\.skip\s*\(\s*(['"`])/g) || []).length;
  localSuppressionDirectives += (source.match(/eslint-disable|@ts-ignore|@ts-expect-error/g) || [])
    .length;
}

const moduleBudgets = budget.modules || {};
const modules = Object.keys(moduleBudgets).map((modulePath) => {
  const absolute = resolve(root, modulePath);
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch {
    return { path: modulePath, missing: true, lines: 0, bytes: 0 };
  }
  return {
    path: modulePath,
    missing: false,
    lines: (text.match(/\n/g) || []).length,
    bytes: statSync(absolute).size,
  };
});

// A source file over this size must carry an explicit module budget (docs/private/
// SCOREEDITOR_DECOMPOSITION_PLAN_2026-10-02.md §6), so a new large file is a decision in review,
// not an accident. The budgets only go down; ScoreEditor has its own entry above.
const unlistedModuleMaxLines = budget.unlistedModuleMaxLines ?? 900;
const unbudgetedLargeFiles = ownedFiles
  .map((file) => relative(root, file))
  .filter((file) => /^(?:app|components|lib)\//.test(file))
  .filter((file) => file !== 'components/ScoreEditor.tsx' && !(file in moduleBudgets))
  .map((file) => ({
    path: file,
    lines: (readFileSync(resolve(root, file), 'utf8').match(/\n/g) || []).length,
  }))
  .filter((entry) => entry.lines > unlistedModuleMaxLines);

const report = {
  baseCommit,
  runtime: {
    node: process.version,
  },
  scoreEditor,
  modules,
  unbudgetedLargeFiles,
  eslint: {
    filesScanned: eslintRows.length,
    filesWithFindings,
    errors: eslintErrors,
    warnings: eslintWarnings,
    topRules,
    topFiles,
  },
  tests: {
    unconditionalSkips,
  },
  suppressions: {
    localDirectives: localSuppressionDirectives,
  },
};

const checks = [
  ['ScoreEditor lines', report.scoreEditor.lines, budget.scoreEditor.maxLines],
  ['ScoreEditor bytes', report.scoreEditor.bytes, budget.scoreEditor.maxBytes],
  ['ESLint errors', report.eslint.errors, budget.eslint.maxErrors],
  ['ESLint warnings', report.eslint.warnings, budget.eslint.maxWarnings],
  [
    'files with ESLint findings',
    report.eslint.filesWithFindings,
    budget.eslint.maxFilesWithFindings,
  ],
  ['unconditional test skips', report.tests.unconditionalSkips, budget.tests.maxUnconditionalSkips],
  [
    'local suppression directives',
    report.suppressions.localDirectives,
    budget.suppressions.maxLocalDirectives,
  ],
  ...report.unbudgetedLargeFiles.map((entry) => [
    `${entry.path} lines (over ${unlistedModuleMaxLines} with no module budget)`,
    entry.lines,
    unlistedModuleMaxLines,
  ]),
  ...report.modules.flatMap((entry) => [
    [`${entry.path} lines`, entry.lines, moduleBudgets[entry.path].maxLines],
    [`${entry.path} bytes`, entry.bytes, moduleBudgets[entry.path].maxBytes],
  ]),
];
const failures = checks.filter(([, actual, maximum]) => actual > maximum);
// A budgeted module that no longer exists is a silently dropped ratchet, not a pass.
const missingModules = report.modules.filter((entry) => entry.missing);

if (jsonOutput) {
  console.log(JSON.stringify({ report, budget, failures }, null, 2));
} else {
  console.log(`[debt:audit] base ${report.baseCommit}`);
  console.log(
    `[debt:audit] ScoreEditor: ${report.scoreEditor.lines} lines, ${report.scoreEditor.bytes} bytes`,
  );
  console.log(
    `[debt:audit] ESLint: ${report.eslint.errors} errors, ${report.eslint.warnings} warnings, ${report.eslint.filesWithFindings}/${report.eslint.filesScanned} files with findings`,
  );
  console.log(
    `[debt:audit] tests: ${report.tests.unconditionalSkips} unconditional skips; suppressions: ${report.suppressions.localDirectives} local directives`,
  );
  if (report.modules.length > 0) {
    console.log('[debt:audit] budgeted modules:');
    for (const entry of report.modules) {
      console.log(
        entry.missing
          ? `  ${entry.path}: MISSING`
          : `  ${entry.path}: ${entry.lines} lines, ${entry.bytes} bytes`,
      );
    }
  }
  console.log('[debt:audit] top rules:');
  for (const rule of report.eslint.topRules) {
    console.log(`  ${rule.rule}: ${rule.errors} errors, ${rule.warnings} warnings`);
  }
  console.log('[debt:audit] top files:');
  for (const file of report.eslint.topFiles) {
    console.log(`  ${file.file}: ${file.errors} errors, ${file.warnings} warnings`);
  }
}

/**
 * Budgets may only move down. A raise has to be declared in the budget file itself with
 * its exact before/after values and a reason, so `check:debt` cannot be made green by
 * quietly widening the target it checks against.
 */
const checkRatchetDirection = () => {
  const preferredRef = resolveBaseRef();
  // A base ref that predates the budget file proves nothing. Fall back to the last
  // commit, which still catches a raise — just over a shorter span.
  const candidates = preferredRef === 'HEAD' ? ['HEAD'] : [preferredRef, 'HEAD'];
  let baseRef = null;
  let baseFile = null;
  for (const candidate of candidates) {
    const result = git(['show', `${candidate}:${budgetPath}`]);
    if (result.status === 0) {
      baseRef = candidate;
      baseFile = result;
      break;
    }
  }

  if (!baseFile) {
    const detail = `${budgetPath} does not exist at ${candidates.join(' or ')}`;
    if (process.env.CI) {
      console.error(`[debt:audit] ratchet direction unverifiable: ${detail}.`);
      console.error(
        '[debt:audit] the debt job needs full history (fetch-depth: 0) to compare budgets.',
      );
      return false;
    }
    console.warn(`[debt:audit] ratchet direction not checked: ${detail}.`);
    return true;
  }
  if (baseRef !== preferredRef) {
    console.log(
      `[debt:audit] ${preferredRef} predates ${budgetPath}; comparing budgets against ${baseRef}.`,
    );
  }

  const { raises, failures: directionFailures } = analyzeRatchetDirection(
    JSON.parse(baseFile.stdout),
    budget,
  );
  if (directionFailures.length > 0) {
    console.error(`[debt:audit] budget raised against ${baseRef}:`);
    for (const failure of directionFailures) {
      console.error(`  ${failure.rule}: ${failure.detail}`);
    }
    return false;
  }
  for (const raise of raises) {
    console.log(`[debt:audit] declared raise: ${raise.key} ${raise.from} -> ${raise.to}`);
  }
  return true;
};

if (checkBudget) {
  const directionOk = checkRatchetDirection();
  if (!directionOk) {
    process.exitCode = 1;
  }
  if (failures.length > 0 || missingModules.length > 0) {
    console.error('[debt:audit] budget regression:');
    for (const [label, actual, maximum] of failures) {
      console.error(`  ${label}: ${actual} > ${maximum}`);
    }
    for (const entry of missingModules) {
      console.error(`  ${entry.path}: budgeted module is missing`);
    }
    process.exitCode = 1;
  } else if (directionOk) {
    console.log('[debt:audit] all ratchets pass.');
  }
}
