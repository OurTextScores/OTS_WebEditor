#!/usr/bin/env node
// Copy freshly built webmscore artifacts into public/ for Next to serve
const fs = require('fs');
const path = require('path');

const defaultFiles = ['webmscore.lib.js', 'webmscore.lib.wasm', 'webmscore.lib.data', 'webmscore.lib.mem.wasm'];
const optionalFiles = ['webmscore.lib.js.mem'];

function syncWasmArtifacts({
  repoRoot = process.env.OTS_WEB_REPO_ROOT || path.join(__dirname, '..'),
  srcDir = path.join(repoRoot, 'webmscore-fork', 'web-public'),
  destDir = path.join(repoRoot, 'public'),
  files = defaultFiles,
  optional = optionalFiles,
  fsModule = fs,
  log = console.log,
} = {}) {
  const jsMem = path.join(srcDir, 'webmscore.lib.js.mem');
  const memWasm = path.join(srcDir, 'webmscore.lib.mem.wasm');
  if (fsModule.existsSync(jsMem)) {
    fsModule.copyFileSync(jsMem, memWasm);
    log('[sync-wasm] Synced webmscore.lib.mem.wasm from webmscore.lib.js.mem');
  }

  function copyFile(name, { required = true } = {}) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (!fsModule.existsSync(src)) {
      if (required) {
        throw new Error(`Missing source artifact: ${src}`);
      }
      log(`[sync-wasm] Optional artifact missing: ${name}`);
      return;
    }
    fsModule.copyFileSync(src, dest);
    log(`[sync-wasm] Copied ${name}`);
  }

  files.forEach((name) => copyFile(name));
  optional.forEach((name) => copyFile(name, { required: false }));
  log('[sync-wasm] All artifacts copied to public/');
  return true;
}

module.exports = {
  defaultFiles,
  optionalFiles,
  syncWasmArtifacts,
};
