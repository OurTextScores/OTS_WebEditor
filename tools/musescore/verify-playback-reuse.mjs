import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Phase 8 prepared-playback reuse. A start reuses the previous preparation only while its key holds, and a reused
// start must sound exactly like a fresh one: PCM is compared byte for byte against the same start with reuse off.

const PULLS = 160; // 160 × 512 frames ≈ 1.9 s

export async function verifyPlaybackReuse(W, Module) {
  assert.ok(W.bundled, 'Playback reuse requires MS47_BUNDLE (diagnostics through the test module)');
  const diagnostics = () => {
    const ptr = Module.ccall('playbackDiagnostics', 'number', [], []);
    try {
      const length = new DataView(Module.HEAPU8.buffer).getUint32(ptr + 4, true);
      return JSON.parse(
        new TextDecoder().decode(Module.HEAPU8.subarray(ptr + 8, ptr + 8 + length)),
      );
    } finally {
      Module._free(ptr);
    }
  };
  const setReuse = (enabled) => Module.ccall('setPlaybackReuse', null, ['boolean'], [enabled]);
  const hash = (chunks) => createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
  // Pull `pulls` chunks from an opened iterator, then cancel; returns the PCM hash and whether it was reused.
  const pull = async (iterator, pulls = PULLS) => {
    const reused = diagnostics().lastPrepare.reused;
    const chunks = [];
    for (let i = 0; i < pulls; i++) {
      const [res] = await iterator(false);
      chunks.push(Buffer.from(res.chunk));
      if (res.done) break;
    }
    await iterator(true);
    return { reused, pcm: hash(chunks), chunks: chunks.length };
  };
  const play = async (score, seconds, pulls) =>
    pull(await score.synthAudioBatch(seconds, 1), pulls);
  // The same start, prepared from scratch.
  const fresh = async (start) => {
    setReuse(false);
    try {
      return await start();
    } finally {
      setReuse(true);
    }
  };

  await W.setSoundFont(new Uint8Array(await readFile(process.env.MS47_SOUNDFONT)));
  const bach = await W.load(
    'mscz',
    new Uint8Array(
      await readFile(new URL('../../public/test_scores/bach_orig.mscz', import.meta.url)),
    ),
  );
  const other = await W.load(
    'musicxml',
    new Uint8Array(
      await readFile(
        new URL('../../public/test_scores/eight_bars_one_voice.musicxml', import.meta.url),
      ),
    ),
  );
  const result = {};
  try {
    // Fresh preparation is itself deterministic, or none of the comparisons below mean anything.
    const a = await fresh(() => play(bach, 2));
    const b = await fresh(() => play(bach, 2));
    assert.equal(a.pcm, b.pcm, 'fresh preparation is deterministic');
    assert.equal(a.reused, false);

    // Reuse after the previous stream was cancelled mid-note, at the same, a later and an earlier time.
    await play(bach, 0, 120);
    const sameStart = await play(bach, 2);
    assert.equal(sameStart.reused, true, 'an unchanged score reuses its preparation');
    assert.equal(
      sameStart.pcm,
      a.pcm,
      'reused start at 2 s sounds like a fresh one, after a cancelled stream',
    );
    for (const seconds of [20, 5, 0]) {
      await play(bach, 10, 90);
      const reused = await play(bach, seconds);
      const expected = await fresh(() => play(bach, seconds));
      assert.equal(reused.reused, true, `seek to ${seconds} s reuses`);
      assert.equal(
        reused.pcm,
        expected.pcm,
        `reused start at ${seconds} s matches fresh, after a cancel at 10 s + 1 s`,
      );
    }

    // After a stream that ran to its natural end (a measure range), and after a one-shot selection preview.
    await bach.selectAll();
    await pull(await bach.synthAudioBatchForMeasureRange(0, 0, 1), 10_000);
    const afterRange = await play(bach, 0);
    assert.equal(afterRange.reused, true, 'measure range shares the preparation');
    assert.equal(
      afterRange.pcm,
      (await fresh(() => play(bach, 0))).pcm,
      'start after a finished range matches fresh',
    );
    await pull(await bach.synthSelectionPreviewBatch(1, 500), 10_000);
    const afterPreview = await play(bach, 0);
    assert.equal(
      afterPreview.pcm,
      (await fresh(() => play(bach, 0))).pcm,
      'start after a selection preview matches fresh (preview notes do not ring on)',
    );

    // Every key component forces a fresh preparation, whose sound follows the change.
    const beforeEdit = await fresh(() => play(bach, 0));
    await bach.pitchUp();
    const edited = await play(bach, 0);
    assert.equal(edited.reused, false, 'an edit invalidates');
    assert.notEqual(edited.pcm, beforeEdit.pcm);
    assert.equal(edited.pcm, (await fresh(() => play(bach, 0))).pcm);
    await bach.undo();
    const undone = await play(bach, 0);
    assert.equal(undone.reused, false, 'undo invalidates');
    assert.equal(undone.pcm, (await fresh(() => play(bach, 0))).pcm);
    await bach.redo();
    assert.equal((await play(bach, 0, 5)).reused, false, 'redo invalidates');
    await bach.undo();
    await play(bach, 0, 5);

    await bach.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    const slower = await play(bach, 0);
    assert.equal(slower.reused, false, 'an options change invalidates');
    assert.equal(slower.pcm, (await fresh(() => play(bach, 0))).pcm);
    assert.equal((await play(bach, 0, 5)).reused, true, 'and the new options are reused');
    await bach.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });

    await play(other, 0, 5);
    assert.equal(
      (await play(bach, 0, 5)).reused,
      false,
      "another score's start releases this preparation",
    );

    Module.ccall('invalidateSoundFont', 'boolean', [], []);
    await W.setSoundFont(new Uint8Array(await readFile(process.env.MS47_SOUNDFONT)));
    assert.equal((await play(bach, 0, 5)).reused, false, 'a soundfont change invalidates');

    await bach.generateExcerpts();
    await bach.setExcerptId(0);
    const excerpt = await play(bach, 0);
    assert.equal(excerpt.reused, false, 'a part (excerpt) is its own score');
    await bach.setExcerptId(-1);
    assert.equal(
      (await play(bach, 0, 5)).reused,
      false,
      'and back to the full score prepares again',
    );

    // Idle preparation never supersedes an active owner and does not create a stream of its own.
    const active = await other.synthAudioBatch(0, 1);
    assert.equal(await bach.warmupPlayback(), false, 'warmup skips an active mixer');
    assert.ok((await active())[0].chunk.byteLength > 0, 'the active owner remains usable');
    await active(true);
    await bach.selectAll();
    await bach.pitchUp();
    const xmlBeforeWarmup = await bach.saveXml();
    const undoBeforeWarmup = await bach.getUndoInfo();
    assert.equal(await bach.warmupPlayback(), true);
    assert.deepEqual(await bach.saveXml(), xmlBeforeWarmup, 'warmup does not change saved notation');
    assert.deepEqual(await bach.getUndoInfo(), undoBeforeWarmup, 'warmup does not create undo entries');
    assert.equal(diagnostics().activeStreams, 0, 'warmup never renders or claims a stream');
    assert.equal(diagnostics().lastPrepare.reused, false, 'warmup rebuilds an edited score');
    assert.equal((await play(bach, 0, 5)).reused, true, 'Play uses the idle preparation');

    // Cost: a reused start skips model load and track setup entirely.
    await play(bach, 0, 5);
    const t = performance.now();
    const iterator = await bach.synthAudioBatch(0, 1);
    const reusedOpenMs = performance.now() - t;
    await iterator(true);
    setReuse(false);
    const f = performance.now();
    const freshIterator = await bach.synthAudioBatch(0, 1);
    const freshOpenMs = performance.now() - f;
    await freshIterator(true);
    setReuse(true);
    assert.ok(
      reusedOpenMs < freshOpenMs / 4,
      `reused open ${reusedOpenMs.toFixed(1)} ms vs fresh ${freshOpenMs.toFixed(1)} ms`,
    );
    Object.assign(result, { reusedOpenMs, freshOpenMs, comparedPulls: PULLS });
  } finally {
    setReuse(true);
    await bach.destroy();
    await other.destroy();
  }
  // Destroying the score released its sequence.
  assert.equal(diagnostics().sequences, 0, 'no sequence outlives its score');
  console.log(`MS47_PLAYBACK_REUSE=${JSON.stringify(result)}`);
  return result;
}
