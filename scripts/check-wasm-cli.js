#!/usr/bin/env node
/*
 * CLI entry point for verifying that the required webmscore WASM artifacts are present and non-empty.
 * Usage: node scripts/check-wasm-cli.js
 */

const { checkWasmArtifacts } = require('./check-wasm.js');

const ok = checkWasmArtifacts();
if (!ok) {
  process.exit(1);
}
