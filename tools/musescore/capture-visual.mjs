// Capture the packaged browser engine without requiring a native MuseScore checkout.
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSvgRenderer } from './svgcheck.mjs';
import { verifyFidelity } from './verify-fidelity.mjs';

const [bundleArg, captureArg, outputArg] = process.argv.slice(2);
if (!bundleArg || !captureArg || !outputArg || process.argv.length !== 5) {
  throw new Error('Usage: node tools/musescore/capture-visual.mjs <browser-bundle> <new-capture-dir> <new-output-dir>');
}
if (!process.env.OTS_VISUAL_ENVIRONMENT) throw new Error('OTS_VISUAL_ENVIRONMENT must identify the pinned rendering image');
const bundle = path.resolve(bundleArg), capture = path.resolve(captureArg), output = path.resolve(outputArg);
await mkdir(output); // exclusive, just like the capture and report directories
const emptyResources = await mkdtemp(path.join(tmpdir(), 'ots-visual-resources-'));
let renderer;
try {
  process.env.MS47_RESOURCE_ROOT = emptyResources;
  process.env.MS47_FIDELITY_CAPTURE = capture;
  const WebMscore = createRequire(import.meta.url)(path.join(bundle, 'webmscore.nodejs.test.cjs'));
  WebMscore.bundled = true;
  // The package contains its preloaded resources. No network-dependent lazy fonts in this corpus.
  WebMscore.fetchResource = async () => null;
  await WebMscore.ready;
  renderer = await createSvgRenderer();
  try {
    await verifyFidelity(WebMscore, renderer, output, bundle);
  } catch (error) {
    // Semantic discrepancies are written to the capture manifest and remain a separate gate.
    // Never treat a failed render, incomplete capture, or unrelated exception as success.
    if (!error.message.startsWith('Fidelity assertions failed: ')) throw error;
    const manifest = JSON.parse(await readFile(path.join(capture, 'manifest.json'), 'utf8'));
    const failures = JSON.parse(await readFile(path.join(output, 'fidelity-failures.json'), 'utf8'));
    if (!failures.length || JSON.stringify(manifest.semanticFailures) !== JSON.stringify(failures)) throw error;
    console.log(`Recorded ${failures.length} semantic failures separately from visual comparison`);
  }
} finally {
  if (renderer) await renderer.close();
  await rm(emptyResources, { recursive: true, force: true });
}
