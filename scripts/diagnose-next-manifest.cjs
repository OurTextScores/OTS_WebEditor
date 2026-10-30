// CI-only preload for the Playwright Next.js dev server. It reports metadata,
// never contents, only when Next's manifest loader fails to parse a manifest.
/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preload must be CommonJS. */
'use strict';

if (process.env.CI && process.env.NEXT_DIST_DIR) {
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const root = path.resolve(process.env.NEXT_DIST_DIR) + path.sep;
  const readFileSync = fs.readFileSync;
  const parse = JSON.parse;
  let latest = null;

  fs.readFileSync = function (...args) {
    const result = readFileSync.apply(this, args);
    const file = args[0];
    if (typeof file === 'string') {
      const resolved = path.resolve(file);
      if (resolved.startsWith(root) && /manifest[^/\\]*\.json$/i.test(path.basename(resolved))) {
        const text = typeof result === 'string' ? result : Buffer.isBuffer(result) ? result.toString('utf8') : null;
        latest = text === null ? null : { path: resolved, text };
      }
    }
    return result;
  };

  JSON.parse = function (...args) {
    try {
      const result = parse.apply(this, args);
      if (latest && args[0] === latest.text) latest = null;
      return result;
    } catch (error) {
      const record = latest;
      if (record && args[0] === record.text && error instanceof SyntaxError &&
          /next[\\/]dist[\\/]server[\\/]load-manifest\.external\.js/.test(error.stack || '')) {
        latest = null;
        let stat = null;
        try {
          const current = fs.statSync(record.path);
          stat = { bytesNow: current.size, modifiedAt: current.mtime.toISOString() };
        } catch { /* The file may have been replaced or removed after the read. */ }
        const diagnostic = {
          event: 'next_manifest_parse_failure',
          path: record.path,
          bytesRead: Buffer.byteLength(record.text, 'utf8'),
          sha256: crypto.createHash('sha256').update(record.text, 'utf8').digest('hex'),
          ...stat,
          pid: process.pid,
        };
        console.error('[playwright-manifest-diagnostic]', JSON.stringify(diagnostic));
      }
      throw error;
    }
  };
}
