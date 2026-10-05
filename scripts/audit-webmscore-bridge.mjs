/**
 * TD-05 — webmscore bridge completeness audit.
 *
 * Turns the six-layer checklist in AGENTS.md into a source contract. The failure this
 * exists to catch is a method that compiles but silently does not exist in the app,
 * usually because worker-helper.js or webmscore-loader.ts was forgotten.
 *
 * Deliberately structural, not a substring search: each layer is parsed for real
 * declarations, so a mention in a comment, a JSDoc block, or a test cannot satisfy a
 * requirement. Intentional asymmetry lives in scripts/webmscore-bridge-manifest.json
 * with a written reason per entry.
 *
 * Usage: node scripts/audit-webmscore-bridge.mjs [--json]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Class methods declared at one indent level inside a class body. */
const parseClassMethods = (source) =>
  new Set(
    [...source.matchAll(/^ {4}(?:async\s+)?(?:get\s+|set\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm)]
      .map((match) => match[1])
      .filter((name) => name !== 'constructor'),
  );

/** EMSCRIPTEN_KEEPALIVE exports inside the extern "C" block of main.cpp. */
const parseNativeExports = (source) => {
  const blockStart = source.indexOf('extern "C" {');
  if (blockStart < 0) return null;
  return new Set(
    [
      ...source
        .slice(blockStart)
        .matchAll(/EMSCRIPTEN_KEEPALIVE\s*\n\s*[\w:<>\s*&]+?\s+(\w+)\s*\(/g),
    ].map((match) => match[1]),
  );
};

/**
 * Exports that return the `WasmRes` struct by value instead of `WasmResBytes`.
 *
 * `WasmRes` is a non-trivial struct with an implicit conversion to a pointer.
 * Returning it by value from an `extern "C"` export gives the function a hidden
 * struct-return parameter in slot 0, so every argument the caller passes lands
 * one slot late: `irregularMeasures` was built on a score pointer of -1 and
 * spun forever inside the worker. Nothing reports it — the promise simply never
 * settles, the pane stays empty, and every layer above it looks healthy.
 *
 * All 35 sibling exports return `WasmResBytes` and the conversion happens on
 * the way out, which is what this enforces.
 */
const parseStructReturningExports = (source) => {
  const blockStart = source.indexOf('extern "C" {');
  if (blockStart < 0) return [];
  return [
    ...source.slice(blockStart).matchAll(/EMSCRIPTEN_KEEPALIVE\s*\n\s*WasmRes\s+(\w+)\s*\(/g),
  ].map((match) => match[1]);
};

/**
 * Literal RPC target names the worker helper actually dispatches. Matches any
 * receiver, not just `this`: the module-level handshake calls `instance.rpc('ready')`,
 * `instance.rpc('load', ...)` and `instance.rpc('setLogLevel', ...)`.
 */
const parseRpcTargets = (source) =>
  new Set([...source.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((match) => match[1]));

/**
 * Member names of the exported Score interface: the lines indented exactly two spaces. Prettier puts a method's
 * parameter object types on following lines at four, so a wider match read their properties (`x`, `value`,
 * `startTime`...) as methods and the audit failed on all of them.
 */
const parseScoreInterface = (source) => {
  const header = /export interface Score\s*\{/.exec(source);
  if (!header) return null;
  let depth = 0;
  let end = -1;
  for (let i = header.index + header[0].length - 1; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = source.slice(header.index + header[0].length, end);
  return new Set(
    [...body.matchAll(/^ {2}([a-zA-Z_$][\w$]*)\??\s*[:(]/gm)].map((match) => match[1]),
  );
};

/**
 * Pure rule engine over already-read sources, so the contract can be unit tested with
 * fixtures instead of only end to end against the real fork.
 *
 * @param {{native: string|null, mainThread: string|null, worker: string|null, typescript: string|null}} sources
 * @param {object} manifest
 */
export function analyzeBridge(sources, manifest) {
  const failures = [];
  const fail = (rule, detail) => failures.push({ rule, detail });

  for (const [layer, path] of Object.entries(manifest.layers)) {
    if (sources[layer] == null) fail('layer-missing', `${layer} source not found at ${path}`);
  }
  if (failures.length > 0) return { report: null, failures };

  const native = parseNativeExports(sources.native);
  const mainThread = parseClassMethods(sources.mainThread);
  const workerMethods = parseClassMethods(sources.worker);
  const rpcTargets = parseRpcTargets(sources.worker);
  const scoreMembers = parseScoreInterface(sources.typescript);

  for (const name of parseStructReturningExports(sources.native)) {
    fail(
      'native-struct-return',
      `${name} returns WasmRes by value; declare it WasmResBytes or its ` +
        'arguments arrive one slot late and the call never returns',
    );
  }

  if (!native) fail('layer-unparseable', 'no extern "C" block found in the native layer');
  if (!scoreMembers)
    fail('layer-unparseable', 'no exported Score interface found in the TypeScript layer');
  if (failures.length > 0) return { report: null, failures };

  const jsImplemented = manifest.jsImplementedRpcTargets || {};
  const controlPlane = manifest.controlPlaneRpcTargets || {};
  const typescriptOnly = manifest.typescriptOnlyMembers || {};
  const syntheticPrefix = manifest.syntheticRpcPrefix || '';

  const resolveNative = (rpcName) => {
    if (native.has(rpcName)) return rpcName;
    if (syntheticPrefix && rpcName.startsWith(syntheticPrefix)) {
      const stripped = rpcName.slice(syntheticPrefix.length);
      if (native.has(stripped)) return stripped;
    }
    return null;
  };

  // Rule 1/2: anything the app is allowed to call must exist on both JS layers.
  for (const member of [...scoreMembers].sort()) {
    if (member in typescriptOnly) continue;
    if (!mainThread.has(member)) {
      fail('missing-main-thread', `Score.${member} has no method in ${manifest.layers.mainThread}`);
    }
    if (!workerMethods.has(member)) {
      fail(
        'missing-worker-proxy',
        `Score.${member} has no worker method in ${manifest.layers.worker}`,
      );
    }
  }

  // Rule 3: every dispatched RPC name must land somewhere real.
  for (const target of [...rpcTargets].sort()) {
    if (target in controlPlane || target in jsImplemented) continue;
    if (!resolveNative(target)) {
      fail(
        'unresolved-rpc-target',
        `worker dispatches '${target}' with no native export and no manifest entry`,
      );
    }
  }

  // Rule 4: allowlists must not rot. An entry that is no longer needed hides a real check.
  for (const target of Object.keys(jsImplemented)) {
    if (!rpcTargets.has(target)) {
      fail(
        'stale-allowlist',
        `jsImplementedRpcTargets.${target} is no longer dispatched; remove it`,
      );
    } else if (resolveNative(target)) {
      fail(
        'stale-allowlist',
        `jsImplementedRpcTargets.${target} now has a native export; remove it`,
      );
    }
  }
  for (const target of Object.keys(controlPlane)) {
    if (!rpcTargets.has(target)) {
      fail(
        'stale-allowlist',
        `controlPlaneRpcTargets.${target} is no longer dispatched; remove it`,
      );
    }
  }
  for (const member of Object.keys(typescriptOnly)) {
    if (!scoreMembers.has(member)) {
      fail(
        'stale-allowlist',
        `typescriptOnlyMembers.${member} is not on the Score interface; remove it`,
      );
    }
  }

  // Informational only: plenty of native exports are internal C helpers with no JS caller.
  const reachableNative = new Set(
    [...rpcTargets].map((target) => resolveNative(target)).filter(Boolean),
  );
  const unproxiedNative = [...native].filter((name) => !reachableNative.has(name)).sort();

  // Layer 6: the generated artifacts the app actually loads.
  const generated = analyzeGeneratedArtifacts(sources.generated, manifest, {
    native,
    rpcTargets,
    mainThread,
  });
  failures.push(...generated.failures);

  return {
    report: {
      counts: {
        nativeExports: native.size,
        mainThreadMethods: mainThread.size,
        workerMethods: workerMethods.size,
        rpcTargets: rpcTargets.size,
        scoreMembers: scoreMembers.size,
      },
      unproxiedNative,
      unverifiableSync: generated.unverifiable,
    },
    failures,
  };
}

/** Word-boundary presence. Substring matching would let `title` satisfy `titleFilenameSafe`. */
const declaresName = (source, name) =>
  new RegExp(`\\b_?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(source);

/**
 * Rules 5 and 6 of the AGENTS.md checklist: the hand-edited layers being consistent
 * proves nothing if the artifacts built from them were never regenerated or copied.
 * This is the failure this audit exists to catch, one step further along -- a method
 * present in all four source layers but absent from the bundle the app imports.
 *
 * Three separate mistakes, three separate rules:
 *
 *   - forgot `npm run compile`  -> a native export missing from the emscripten glue;
 *   - forgot `npm run bundle`   -> a bridge name missing from a rollup output;
 *   - forgot `npm run sync:wasm`-> `public/` holding a different build than the fork.
 *
 * Honest limit: the first two are name-presence checks, so they catch a new, renamed or
 * removed entry point, not an edited method body. Only the sync rule is exact, because
 * it compares digests. A rebuilt-but-unbundled body change still needs the AGENTS.md
 * browser verification.
 */
export function analyzeGeneratedArtifacts(generated, manifest, parsed) {
  const config = manifest.generated;
  if (!config) return { failures: [], unverifiable: [] };

  const failures = [];
  const fail = (rule, detail) => failures.push({ rule, detail });
  const artifacts = generated || {};

  if (config.glue) {
    const glue = artifacts.glue;
    if (glue == null) {
      fail(
        'generated-artifact-missing',
        `emscripten glue not found at ${config.glue}; run npm run compile in webmscore-fork/web-public`,
      );
    } else {
      const absent = [...parsed.native].filter((name) => !declaresName(glue, name)).sort();
      for (const name of absent) {
        fail(
          'missing-from-generated-glue',
          `native export ${name} is not in ${config.glue}; the WASM build predates the native source (npm run compile)`,
        );
      }
    }
  }

  // Everything the worker can dispatch or the main thread can call has to survive
  // bundling, whichever entry point a consumer resolves.
  const bundledNames = [...new Set([...parsed.rpcTargets, ...parsed.mainThread])].sort();
  for (const bundlePath of Object.keys(config.bundles || {})) {
    const bundle = (artifacts.bundles || {})[bundlePath];
    if (bundle == null) {
      fail(
        'generated-artifact-missing',
        `bundle not found at ${bundlePath}; run npm run bundle in webmscore-fork/web-public`,
      );
      continue;
    }
    const absent = bundledNames.filter((name) => !declaresName(bundle, name));
    for (const name of absent) {
      fail(
        'missing-from-generated-bundle',
        `${name} is in the bridge source but not in ${bundlePath}; the bundle predates the source (npm run bundle)`,
      );
    }
  }

  // The fork's build outputs are gitignored -- only the copies under public/ are
  // committed -- so a fresh clone has nothing to compare against. That is normal in CI
  // and is reported, not failed: with no locally built artifact there is simply nothing
  // this rule can prove. It fails only where both sides exist and disagree, which is a
  // developer or release machine that built but forgot to sync.
  const unverifiable = [];
  for (const [shipped, source] of Object.entries(config.synced || {})) {
    const digests = artifacts.digests || {};
    if (!digests[source]) {
      unverifiable.push(`${shipped}: no local build at ${source}`);
      continue;
    }
    if (!digests[shipped]) {
      fail('generated-artifact-missing', `${shipped} is missing; run npm run sync:wasm`);
      continue;
    }
    if (digests[shipped] !== digests[source]) {
      fail(
        'unsynced-generated-artifact',
        `${shipped} differs from ${source}; the served artifact is not the one that was built (npm run sync:wasm)`,
      );
    }
  }

  return { failures, unverifiable };
}

function main() {
  // Resolved lazily so importing this module for its rules has no side effects.
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const jsonOutput = process.argv.includes('--json');
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'scripts/webmscore-bridge-manifest.json'), 'utf8'),
  );
  const read = (relativePath) => {
    try {
      return readFileSync(resolve(root, relativePath), 'utf8');
    } catch {
      return null;
    }
  };

  const digest = (relativePath) => {
    try {
      return createHash('sha256')
        .update(readFileSync(resolve(root, relativePath)))
        .digest('hex');
    } catch {
      return null;
    }
  };

  const generatedConfig = manifest.generated || {};
  const sources = {
    ...Object.fromEntries(
      Object.entries(manifest.layers).map(([layer, path]) => [layer, read(path)]),
    ),
    generated: {
      glue: generatedConfig.glue ? read(generatedConfig.glue) : null,
      bundles: Object.fromEntries(
        Object.keys(generatedConfig.bundles || {}).map((path) => [path, read(path)]),
      ),
      digests: Object.fromEntries(
        Object.entries(generatedConfig.synced || {})
          .flat()
          .map((path) => [path, digest(path)]),
      ),
    },
  };
  const { report, failures } = analyzeBridge(sources, manifest);

  if (!report) {
    for (const failure of failures)
      console.error(`[bridge:audit] ${failure.rule}: ${failure.detail}`);
    process.exitCode = 1;
    return;
  }
  const { unproxiedNative } = report;

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[bridge:audit] native exports: ${report.counts.nativeExports}`);
    console.log(`[bridge:audit] main-thread methods: ${report.counts.mainThreadMethods}`);
    console.log(
      `[bridge:audit] worker methods: ${report.counts.workerMethods}, rpc targets: ${report.counts.rpcTargets}`,
    );
    console.log(`[bridge:audit] Score interface members: ${report.counts.scoreMembers}`);
    console.log(
      `[bridge:audit] native exports not reachable from the worker: ${unproxiedNative.length} (informational)`,
    );
    for (const name of unproxiedNative) console.log(`    ${name}`);
    for (const note of report.unverifiableSync || []) {
      console.log(`[bridge:audit] sync not verifiable here -- ${note}`);
    }
  }

  if (failures.length > 0) {
    console.error('[bridge:audit] bridge contract violations:');
    for (const failure of failures) console.error(`  ${failure.rule}: ${failure.detail}`);
    process.exitCode = 1;
  } else {
    console.log('[bridge:audit] all bridge layers consistent.');
  }
}

// Only run the CLI when invoked directly, so tests can import analyzeBridge.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
