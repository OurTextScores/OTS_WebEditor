// Bundle the maintained scheduler for browser-only profiling without adding an app/debug endpoint.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function schedulerExperimentScript() {
  const root = fileURLToPath(new URL('../../lib/', import.meta.url));
  const files = [
    'playback/stream-scheduler',
    'playback/stream-frontier',
    'playback-window',
    'perf-trace',
  ];
  const factories = files.map((name) => {
    const source = readFileSync(path.join(root, `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const compiled = outputText
      .replaceAll('process.env.NODE_ENV', '"production"')
      .replace(/require\("(\.[^"]+)"\)/g, (_, relative) => {
        const dependency = path.posix.normalize(
          path.posix.join(path.posix.dirname(name), relative),
        );
        if (!files.includes(dependency))
          throw new Error(`Unbundled scheduler dependency: ${dependency}`);
        return `require(${JSON.stringify(dependency)})`;
      });
    return `${JSON.stringify(name)}: function(require,module,exports) { ${compiled}\n }`;
  });
  return `(() => { const factories = {${factories.join(',')}}; const cache = {};
    const load = (name) => { if (cache[name]) return cache[name].exports;
      const module = cache[name] = {exports: {}}; factories[name](load,module,module.exports); return module.exports; };
    window.__p8scheduler = load('playback/stream-scheduler'); })();`;
}

export async function experimentScheduler(page) {
  await page.addScriptTag({ content: schedulerExperimentScript() });
  return page.evaluate(async () => {
    const results = [];
    const context = new AudioContext({ sampleRate: 44100 });
    await context.resume();
    try {
      // Isolate startup/merging first, then try the combined first-chunk candidate. Shipping defaults never change.
      for (const [label, startupBufferSeconds, mergeWindowSeconds, minStartupBatches] of [
        ['selection-current', 0.6, 0.5, 3],
        ['selection-zero-startup-buffer', 0, 0.5, 3],
        ['selection-200ms', 0.2, 0.5, 3],
        ['selection-unmerged', 0.6, 0, 3],
        ['first-chunk-unmerged', 0, 0, 1],
      ]) {
        const target = {
          sourcesRef: { current: [] },
          iteratorRef: { current: null },
          generationRef: { current: 0 },
        };
        window.__p8.starts = [];
        let underflows = 0;
        const began = performance.now();
        const iterator = await window.__webmscore.synthAudioBatch(0, 8);
        const scheduled = window.__p8scheduler.scheduleSynthBatchStream(iterator, context, {
          ...target,
          debugLabel: label,
          startupBufferSeconds,
          mergeWindowSeconds,
          minStartupBatches,
          prerollSeconds: 0.12,
          renderWindow: null,
          maxDurationSeconds: 2,
          onBufferingChange: (buffering) => {
            if (buffering) underflows += 1;
          },
        });
        await scheduled;
        await new Promise((resolve) => setTimeout(resolve, 400));
        const first = window.__p8.starts[0];
        const retainedSources = target.sourcesRef.current.length;
        const cancelBegan = performance.now();
        await window.__p8scheduler.cancelSynthStream(target, { awaitCancel: true });
        results.push({
          label,
          startupBufferSeconds,
          mergeWindowSeconds,
          minStartupBatches,
          openToFirstScheduleMs: first ? first.wallMs - began : null,
          scheduledSources: window.__p8.starts.length,
          retainedSources,
          underflows,
          cancellationMs: performance.now() - cancelBegan,
        });
      }
    } finally {
      await context.close();
      // A closed experimental context need not dispatch ended; do not count its profiling sources as app retention.
      for (const source of window.__p8.sources) {
        if (source.context === context) window.__p8.sources.delete(source);
      }
    }
    return results;
  });
}
