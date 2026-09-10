import { describe, expect, it } from 'vitest';
import { analyzeBridge } from '../scripts/audit-webmscore-bridge.mjs';
import type { BridgeManifest } from '../scripts/audit-webmscore-bridge.mjs';

type Analysis = ReturnType<typeof analyzeBridge>;

const analyze = analyzeBridge;

const manifest: BridgeManifest = {
  layers: {
    native: 'main.cpp',
    mainThread: 'index.js',
    worker: 'worker-helper.js',
    typescript: 'webmscore-loader.ts',
  },
  syntheticRpcPrefix: '_',
  controlPlaneRpcTargets: { ready: 'handshake' },
  jsImplementedRpcTargets: {},
  typescriptOnlyMembers: {},
};

const nativeSource = `
extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void pitchUp(uintptr_t score_ptr) {
        return _pitchUp(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    void synthAudio(uintptr_t score_ptr) {
        return _synthAudio(score_ptr);
    };
}
`;

const mainThreadSource = `
class WebMscore {
    constructor(scoreptr) {}

    async pitchUp() {
        return Module.ccall('pitchUp')
    }
}
`;

const workerSource = `
class WebMscoreWorker {
    static async load() {
        instance.rpc('ready')
    }

    pitchUp() {
        return this.rpc('pitchUp')
    }

    async synthAudio() {
        return this.rpc('_synthAudio')
    }
}
`;

const typescriptSource = `
export interface Score {
  pitchUp?: () => Promise<void>;
}
`;

const baseSources = () => ({
  native: nativeSource,
  mainThread: mainThreadSource,
  worker: workerSource,
  typescript: typescriptSource,
});

const rules = (result: Analysis) => result.failures.map((failure) => failure.rule);

describe('webmscore bridge audit', () => {
  it('accepts a bridge where every layer is present', () => {
    const result = analyze(baseSources(), manifest);

    expect(result.failures).toEqual([]);
    expect(result.report?.counts.scoreMembers).toBe(1);
  });

  it('resolves an underscore-prefixed rpc target against its native export', () => {
    const result = analyze(baseSources(), manifest);

    // `_synthAudio` must not be reported as unresolved, and `synthAudio` counts as reached.
    expect(rules(result)).not.toContain('unresolved-rpc-target');
    expect(result.report?.unproxiedNative).not.toContain('synthAudio');
  });

  it('fails when the worker rpc proxy layer is missing', () => {
    const sources = baseSources();
    sources.worker = workerSource.replace(/    pitchUp\(\) \{[\s\S]*?\n    \}\n/, '');

    expect(rules(analyze(sources, manifest))).toContain('missing-worker-proxy');
  });

  it('fails when the main-thread wrapper layer is missing', () => {
    const sources = baseSources();
    sources.mainThread = mainThreadSource.replace(/    async pitchUp\(\) \{[\s\S]*?\n    \}\n/, '');

    expect(rules(analyze(sources, manifest))).toContain('missing-main-thread');
  });

  it('is not satisfied by a commented-out or documented method', () => {
    const sources = baseSources();
    sources.worker = workerSource.replace(
      /    pitchUp\(\) \{[\s\S]*?\n    \}\n/,
      "    // pitchUp() { return this.rpc('pitchUp') }\n    /** @see pitchUp */\n",
    );

    expect(rules(analyze(sources, manifest))).toContain('missing-worker-proxy');
  });

  it('fails when the worker dispatches an rpc with no native export or manifest entry', () => {
    const sources = baseSources();
    sources.worker = workerSource.replace(
      "return this.rpc('pitchUp')",
      "return this.rpc('pitchSideways')",
    );

    expect(rules(analyze(sources, manifest))).toContain('unresolved-rpc-target');
  });

  it('accepts an unresolved rpc target once the manifest documents why', () => {
    const sources = baseSources();
    sources.worker = workerSource.replace(
      "return this.rpc('pitchUp')",
      "return this.rpc('pitchSideways')",
    );
    const documented = {
      ...manifest,
      jsImplementedRpcTargets: { pitchSideways: 'composed in JS from pitchUp' },
    };

    expect(rules(analyze(sources, documented))).not.toContain('unresolved-rpc-target');
  });

  it('rejects an allowlist entry that is no longer dispatched', () => {
    const stale = {
      ...manifest,
      jsImplementedRpcTargets: { longGone: 'removed two refactors ago' },
    };

    expect(rules(analyze(baseSources(), stale))).toContain('stale-allowlist');
  });

  it('rejects an allowlist entry that now has a native export', () => {
    const stale = {
      ...manifest,
      jsImplementedRpcTargets: { pitchUp: 'claims to be JS-only but is not' },
    };

    expect(rules(analyze(baseSources(), stale))).toContain('stale-allowlist');
  });

  it('reports an unreadable layer instead of silently passing', () => {
    const sources = { ...baseSources(), worker: null };

    const result = analyze(sources, manifest);
    expect(result.report).toBeNull();
    expect(rules(result)).toContain('layer-missing');
  });

  it('reports an unparseable native layer instead of silently passing', () => {
    const sources = { ...baseSources(), native: '// no extern block here' };

    const result = analyze(sources, manifest);
    expect(result.report).toBeNull();
    expect(rules(result)).toContain('layer-unparseable');
  });
});

/**
 * Layer 5/6. The four source layers agreeing proves nothing if the artifacts built from
 * them are stale: the method exists everywhere a reviewer looks and is absent from what
 * the browser loads.
 */
describe('webmscore generated artifacts', () => {
  const generatedManifest = {
    ...manifest,
    generated: {
      glue: 'webmscore.lib.js',
      bundles: { 'webmscore.mjs': 'the module entry point' },
      synced: { 'public/webmscore.lib.wasm': 'fork/webmscore.lib.wasm' },
    },
  };

  // Both parsed entry points (`pitchUp`, `_synthAudio` -> `synthAudio`) present.
  const freshGlue = 'var _pitchUp = Module["_pitchUp"]; var _synthAudio = Module["_synthAudio"];';
  const freshBundle =
    'class W{pitchUp(){return this.rpc("pitchUp")}synthAudio(){return this.rpc("_synthAudio")}ready(){}}';

  const generated = (overrides = {}) => ({
    glue: freshGlue,
    bundles: { 'webmscore.mjs': freshBundle },
    digests: { 'public/webmscore.lib.wasm': 'abc123', 'fork/webmscore.lib.wasm': 'abc123' },
    ...overrides,
  });

  const withGenerated = (overrides = {}) => ({
    ...baseSources(),
    generated: generated(overrides),
  });

  it('accepts artifacts that carry every bridge entry point', () => {
    expect(analyze(withGenerated(), generatedManifest).failures).toEqual([]);
  });

  it('stays silent when the manifest declares no generated artifacts', () => {
    // The source-only contract must keep working on its own.
    expect(analyze(baseSources(), manifest).failures).toEqual([]);
  });

  it('fails when the WASM glue predates a new native export', () => {
    const result = analyze(
      withGenerated({ glue: 'var _pitchUp = Module["_pitchUp"];' }),
      generatedManifest,
    );

    expect(rules(result)).toContain('missing-from-generated-glue');
    expect(result.failures[0].detail).toContain('synthAudio');
  });

  it('fails when a rollup bundle predates a bridge source change', () => {
    const result = analyze(
      withGenerated({ bundles: { 'webmscore.mjs': 'class W{ready(){}}' } }),
      generatedManifest,
    );

    expect(rules(result)).toContain('missing-from-generated-bundle');
  });

  it('is not satisfied by a prefix of the method name', () => {
    // `title` must not stand in for `titleFilenameSafe`.
    const result = analyze(
      withGenerated({
        bundles: { 'webmscore.mjs': 'class W{pitchUpTwice(){}synthAudioBatch(){}}' },
      }),
      generatedManifest,
    );

    expect(rules(result)).toContain('missing-from-generated-bundle');
  });

  it('fails when the served copy is a different build from the one that was made', () => {
    const result = analyze(
      withGenerated({
        digests: { 'public/webmscore.lib.wasm': 'stale999', 'fork/webmscore.lib.wasm': 'abc123' },
      }),
      generatedManifest,
    );

    expect(rules(result)).toContain('unsynced-generated-artifact');
  });

  it('fails when a declared artifact is absent rather than assuming it is fine', () => {
    expect(rules(analyze(withGenerated({ glue: null }), generatedManifest))).toContain(
      'generated-artifact-missing',
    );
    expect(
      rules(analyze(withGenerated({ bundles: { 'webmscore.mjs': null } }), generatedManifest)),
    ).toContain('generated-artifact-missing');
    // A missing *shipped* copy is still a failure: those are committed.
    expect(
      rules(
        analyze(
          withGenerated({ digests: { 'fork/webmscore.lib.wasm': 'abc123' } }),
          generatedManifest,
        ),
      ),
    ).toContain('generated-artifact-missing');
  });

  it('reports, rather than fails, when there is no local build to compare against', () => {
    // The fork's build outputs are gitignored, so a fresh clone -- every CI run --
    // has the shipped copy and no source to diff it against. Failing there would
    // have made the bridge job red on every PR.
    const result = analyze(
      withGenerated({ digests: { 'public/webmscore.lib.wasm': 'abc123' } }),
      generatedManifest,
    );

    expect(result.failures).toEqual([]);
    expect(result.report?.unverifiableSync).toEqual([
      'public/webmscore.lib.wasm: no local build at fork/webmscore.lib.wasm',
    ]);
  });
});
