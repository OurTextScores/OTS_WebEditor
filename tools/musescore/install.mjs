// Install one complete generated package, then sync served resources. Validate inputs before copying.
import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: npm run install:engine -- <bundled-directory>');
const source = path.resolve(process.argv[2]);
const destination = path.join(repo, 'webmscore-fork/web-public');
const files = [
  'webmscore.lib.js',
  'webmscore.lib.wasm',
  'webmscore.lib.data',
  'webmscore.js',
  'webmscore.mjs',
  'webmscore.webpack.mjs',
  'webmscore.cdn.mjs',
  'webmscore.nodejs.cjs',
];
for (const file of files) {
  if (!existsSync(path.join(source, file)))
    throw new Error(`Incomplete engine package: missing ${file}`);
}
for (const file of files) copyFileSync(path.join(source, file), path.join(destination, file));
execFileSync(process.execPath, [path.join(repo, 'scripts/sync-wasm-cli.js')], {
  cwd: repo,
  stdio: 'inherit',
});
