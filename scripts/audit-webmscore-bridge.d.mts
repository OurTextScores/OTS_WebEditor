/** Types for the TD-05 bridge audit rule engine so consumers need no suppression. */

export type BridgeLayer = 'native' | 'mainThread' | 'worker' | 'typescript';

export type BridgeGeneratedSources = {
  /** Emscripten glue source, or null when absent. */
  glue: string | null;
  /** Rollup output source per manifest path, or null when absent. */
  bundles: Record<string, string | null>;
  /** sha256 per manifest path for the synced-artifact comparison. */
  digests: Record<string, string | null>;
};

export type BridgeSources = Record<BridgeLayer, string | null> & {
  generated?: BridgeGeneratedSources;
};

export type BridgeManifest = {
  layers: Record<BridgeLayer, string>;
  syntheticRpcPrefix?: string;
  controlPlaneRpcTargets?: Record<string, string>;
  jsImplementedRpcTargets?: Record<string, string>;
  typescriptOnlyMembers?: Record<string, string>;
  generated?: {
    glue?: string;
    bundles?: Record<string, string>;
    synced?: Record<string, string>;
  };
};

export type BridgeFailure = {
  rule:
    | 'layer-missing'
    | 'layer-unparseable'
    | 'missing-main-thread'
    | 'missing-worker-proxy'
    | 'unresolved-rpc-target'
    | 'stale-allowlist'
    | 'generated-artifact-missing'
    | 'missing-from-generated-glue'
    | 'missing-from-generated-bundle'
    | 'unsynced-generated-artifact';
  detail: string;
};

export type BridgeReport = {
  counts: {
    nativeExports: number;
    mainThreadMethods: number;
    workerMethods: number;
    rpcTargets: number;
    scoreMembers: number;
  };
  unproxiedNative: string[];
  /** Synced pairs with no local build to compare against; reported, not failed. */
  unverifiableSync: string[];
};

export function analyzeBridge(
  sources: BridgeSources,
  manifest: BridgeManifest,
): { report: BridgeReport | null; failures: BridgeFailure[] };
