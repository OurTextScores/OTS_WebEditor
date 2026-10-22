// Build web-public's real bundles against the 4.7 browser package, in a scratch copy:
//   node tools/ms47-bridge-spike/bundle.mjs <outdir> [<build dir>]
// <outdir> gets web-public/src + rollup.config.js + the locked dev dependencies + webmscore.lib.{js,wasm,data} from
// <build dir>/browser, then `rollup -c` produces webmscore.{js,mjs,nodejs.cjs,...} exactly as the 4.00 release does.
// webmscore.nodejs.test.cjs is the Node bundle plus a live `__testModule` getter, for tests that call native exports
// without JS wrappers; the shipped files are not modified.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webPublic = path.resolve(here, '../../webmscore-fork/web-public');
const out = path.resolve(process.argv[2] ?? 'ms47-bundle');
const build = path.resolve(process.argv[3] ?? path.join(here, '../../../ms47-build-wasm'));

mkdirSync(out, { recursive: true });
for (const name of ['src', 'rollup.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'schemas.ts']) {
  cpSync(path.join(webPublic, name), path.join(out, name), { recursive: true });
}
for (const ext of ['js', 'wasm', 'data']) {
  const file = path.join(build, 'browser', `webmscore.lib.${ext}`);
  if (!existsSync(file)) throw new Error(`missing ${file}: build with MS47_BROWSER=ON`);
  cpSync(file, path.join(out, `webmscore.lib.${ext}`));
}
if (!existsSync(path.join(out, 'node_modules', 'rollup'))) {
  execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: out, stdio: 'inherit' });
}
execFileSync('npx', ['--no-install', 'rollup', '-c'], { cwd: out, stdio: 'inherit' });

const node = readFileSync(path.join(out, 'webmscore.nodejs.cjs'), 'utf8');
if (!/^let Module = moduleOptions;$/m.test(node)) throw new Error('helper.js Module binding not found in the Node bundle');
writeFileSync(path.join(out, 'webmscore.nodejs.test.cjs'),
  `${node}\nObject.defineProperty(module.exports, '__testModule', { get: () => Module });\n`);
console.log(`bundled into ${out}`);
