#!/usr/bin/env node
// CLI entry point: Copy freshly built webmscore artifacts into public/ for Next to serve

const { syncWasmArtifacts } = require('./sync-wasm.js');

try {
  syncWasmArtifacts();
} catch (err) {
  console.error('[sync-wasm] Failed:', err.message);
  process.exit(1);
}
