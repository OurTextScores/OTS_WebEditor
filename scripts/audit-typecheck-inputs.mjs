import { spawnSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const projects = [
  {
    name: 'app',
    config: 'tsconfig.app.json',
    required: ['app/', 'components/ScoreEditor.tsx', 'lib/'],
  },
  {
    name: 'tests',
    config: 'tsconfig.tests.json',
    required: ['unit/', 'tests/'],
  },
];
const forbidden = [
  '/.claude/',
  '/webmscore-fork/',
  '/.next/',
  '/.next-dev-',
  '/out/',
  '/release/',
  '/build/',
];

let failed = false;

for (const project of projects) {
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', project.config, '--listFilesOnly', '--pretty', 'false', '--incremental', 'false'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    failed = true;
    continue;
  }

  const files = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => resolve(file));
  const projectFiles = files
    .filter((file) => file.startsWith(`${root}${sep}`))
    .map((file) => relative(root, file).split(sep).join('/'));
  const ownedFiles = projectFiles.filter((file) => !file.startsWith('node_modules/'));
  const forbiddenFiles = ownedFiles.filter((file) =>
    forbidden.some((fragment) => `/${file}`.includes(fragment)),
  );
  const missingRoots = project.required.filter((required) =>
    required.endsWith('/')
      ? !projectFiles.some((file) => file.startsWith(required))
      : !projectFiles.includes(required),
  );

  if (forbiddenFiles.length > 0 || missingRoots.length > 0) {
    failed = true;
    console.error(`[typecheck:audit] ${project.name} graph failed.`);
    for (const file of forbiddenFiles) console.error(`  forbidden: ${file}`);
    for (const required of missingRoots) console.error(`  missing root: ${required}`);
    continue;
  }

  console.log(
    `[typecheck:audit] ${project.name}: ${files.length} total files, ${ownedFiles.length} owned files; graph clean.`,
  );
}

if (failed) process.exitCode = 1;
