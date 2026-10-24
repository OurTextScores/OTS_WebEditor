#!/usr/bin/env node
/*
 * Verify that the required webmscore WASM artifacts are present and non-empty.
 * Usage: node scripts/check-wasm.js
 */

const fs = require('fs');
const path = require('path');

const defaultFiles = ['public/webmscore.lib.wasm', 'public/webmscore.lib.data'];
// Separate memory initializer: fetched by the emsdk 2 loader (4.00 engine) only; emsdk 4 builds (4.7) have none
const memoryInitializerFile = 'public/webmscore.lib.mem.wasm';
const optionalFiles = ['public/webmscore.lib.js', 'public/webmscore.lib.js.mem'];

const GIT_LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]); // "\0asm"

function readHead(fsModule, fullPath, bytes = 256) {
  const fd = fsModule.openSync(fullPath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const read = fsModule.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, read);
  } finally {
    fsModule.closeSync(fd);
  }
}

function isGitLfsPointer(headBuf) {
  return headBuf.toString('utf8').startsWith(GIT_LFS_POINTER_PREFIX);
}

function hasWasmMagic(headBuf) {
  return headBuf.length >= 4 && headBuf.subarray(0, 4).equals(WASM_MAGIC);
}

// A loader that cannot be read is assumed to need it
// public/webmscore.lib.js is gitignored (sync:wasm copies it), so a fresh clone has only the tracked glue that the
// bundles are built from: read whichever exists
const loaderPaths = (cwd) => [
  path.resolve(cwd, 'public/webmscore.lib.js'),
  path.resolve(cwd, 'webmscore-fork/web-public/webmscore.lib.js'),
];

function loaderNeedsMemoryInitializer(fsModule, loaderPath) {
  try {
    return fsModule.readFileSync(loaderPath, 'utf8').includes('memoryInitializer=');
  } catch {
    return true;
  }
}

function checkWasmArtifacts({
  files = defaultFiles,
  optional = optionalFiles,
  cwd = process.cwd(),
  fsModule = fs,
  log = console.log,
  error = console.error,
  memoryInitializer = loaderNeedsMemoryInitializer(
    fsModule,
    loaderPaths(cwd).find((candidate) => fsModule.existsSync(candidate)) ?? loaderPaths(cwd)[0],
  ),
} = {}) {
  let ok = true;

  function checkFile(f, { required = true } = {}) {
    const full = path.resolve(cwd, f);
    const exists = fsModule.existsSync(full);
    const size = exists ? fsModule.statSync(full).size : 0;
    if (!exists || size === 0) {
      if (required) {
        error(`[wasm-check] MISSING or empty: ${f}`);
        ok = false;
      } else {
        log(`[wasm-check] Optional missing: ${f}`);
      }
      return;
    }

    let headBuf = Buffer.alloc(0);
    try {
      headBuf = readHead(fsModule, full);
    } catch (e) {
      error(`[wasm-check] Failed to read ${f}: ${e?.message ?? String(e)}`);
      ok = false;
      return;
    }

    if (isGitLfsPointer(headBuf)) {
      error(`[wasm-check] ${f} looks like a Git LFS pointer (not the real binary).`);
      ok = false;
      return;
    }

    if (f.endsWith('.wasm') && f.includes('webmscore.lib.wasm') && !hasWasmMagic(headBuf)) {
      error(`[wasm-check] ${f} is not a valid WASM binary (bad magic number).`);
      ok = false;
      return;
    }

    log(`[wasm-check] OK ${f} (${size} bytes)`);
  }

  files.forEach((f) => checkFile(f, { required: true }));
  if (memoryInitializer) checkFile(memoryInitializerFile, { required: true });
  else log(`[wasm-check] Not needed by this loader: ${memoryInitializerFile}`);
  optional.forEach((f) => checkFile(f, { required: false }));

  if (!ok) {
    error(
      [
        '',
        'webmscore artifacts are missing/invalid.',
        '',
        'If you cloned this repo with Git LFS disabled (or downloaded a ZIP), fetch LFS objects:',
        '  git lfs install',
        '  git lfs pull',
        '',
        'If you rebuilt webmscore, re-sync artifacts:',
        '  npm run sync:wasm',
      ].join('\n'),
    );
    return false;
  }

  log('\nAll required webmscore artifacts are present.');
  return true;
}

module.exports = {
  defaultFiles,
  memoryInitializerFile,
  loaderNeedsMemoryInitializer,
  optionalFiles,
  checkWasmArtifacts,
};
