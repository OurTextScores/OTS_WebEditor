import { expect, test } from '@playwright/test';
import type { Score } from '../lib/webmscore-loader';

test('worker applies transient tempo/repeat options to audio, timeline, positions and conversion', async ({
  page,
}) => {
  await page.goto('/?score=/test_scores/four_measures.musicxml');
  await page.waitForSelector('svg .Note', { timeout: 60_000 });
  const result = await page.evaluate(async () => {
    const score = (window as typeof window & { __webmscore?: Score }).__webmscore;
    if (!score?.setPlaybackOptions || !score.playbackTimeline || !score.synthAudioBatch)
      throw new Error('Playback options bridge unavailable');
    const sequence = async () =>
      (await score.playbackTimeline!())!.occurrences.map((o) => o.measureIndex);
    // The worker returns MusicXML as text, although the loader types it as bytes.
    const saveXml = async () => {
      const value: unknown = await score.saveXml!();
      return typeof value === 'string' ? value : new TextDecoder().decode(value as Uint8Array);
    };
    // Install the soundfont explicitly, as the sibling WASM specs do: the app's background warm-up may not have
    // finished yet on a slower engine (Playwright's Firefox has no optimizing wasm compiler).
    const font = await fetch('/soundfonts/default.sf3');
    if (!font.ok) throw new Error(`soundfont fetch ${font.status}`);
    await score.setSoundFont!(new Uint8Array(await font.arrayBuffer()));
    const caps = await score.playbackCapabilities!();
    const initial = await score.playbackOptions!();
    const xml = await saveXml();
    await score.selectPartMeasureByIndex!(0, 1);
    await score.toggleRepeatEnd!();
    const undoIndex = (await score.getUndoInfo!()).index;
    const repeated = await score.playbackTimeline!();
    const onSequence = await sequence();

    const slow = await score.setPlaybackOptions({ tempoMultiplier: 0.5, playRepeats: true });
    const slowTimeline = await score.playbackTimeline!();
    const positions = await score.measurePositions();
    const secondPassStart = repeated!.occurrences[2].startMs;
    const position = await score.playbackPositionAt!(secondPassStart * 2 + 10);
    const sameAtFull =
      (await score.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true }),
      await score.playbackTimeForPosition!(position!));

    const stale = await score.synthAudioBatch(0, 4);
    await stale();
    const flat = await score.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: false });
    const retired = await stale();
    const offSequence = await sequence();
    const fallback = await score.playbackTimeForPosition!(position!);
    const stream = await score.synthAudioBatch(fallback!.timeMs / 1000, 2);
    const first = await stream();
    await stream(true);

    await score.setPlaybackOptions({ tempoMultiplier: 1, playRepeats: true });
    const undoAfter = (await score.getUndoInfo!()).index;
    await score.undo!();
    const restoredXml = await saveXml();
    return {
      caps: caps?.playbackOptions,
      initial,
      onSequence,
      offSequence,
      durations: [repeated!.durationMs, slowTimeline!.durationMs],
      revisions: [
        slow!.revision,
        slowTimeline!.optionsRevision,
        positions.optionsRevision,
        flat!.revision,
      ],
      position: position && { pass: position.pass, revision: position.optionsRevision },
      sameAtFull: sameAtFull && { timeMs: sameAtFull.timeMs, exact: sameAtFull.exact },
      expectedSameMs: secondPassStart + 5,
      fallback: fallback && { exact: fallback.exact, reason: fallback.fallback },
      retired: retired.every((r) => r.done && r.chunk.byteLength === 0),
      firstStart: first[0].startTime,
      fallbackSeconds: fallback!.timeMs / 1000,
      undo: [undoIndex, undoAfter],
      xmlRestored: restoredXml === xml,
    };
  });

  expect(result.caps).toEqual({
    schemaVersion: 1,
    minTempoMultiplier: 0.25,
    maxTempoMultiplier: 2,
    playRepeats: true,
    positionConversion: true,
  });
  expect(result.initial).toMatchObject({ tempoMultiplier: 1, playRepeats: true, revision: 0 });
  expect(result.onSequence).toEqual([0, 1, 0, 1, 2, 3]);
  expect(result.offSequence).toEqual([0, 1, 2, 3]);
  expect(result.durations[1]).toBe(result.durations[0] * 2);
  const [slowRevision, timelineRevision, positionsRevision, flatRevision] = result.revisions;
  expect([timelineRevision, positionsRevision]).toEqual([slowRevision, slowRevision]);
  expect(flatRevision).toBeGreaterThan(slowRevision!);
  expect(result.position).toEqual({ pass: 1, revision: slowRevision });
  expect(result.sameAtFull?.exact).toBe(true);
  expect(result.sameAtFull?.timeMs).toBeCloseTo(result.expectedSameMs, 3);
  expect(result.fallback).toEqual({ exact: false, reason: 'pass-unavailable' });
  expect(result.retired).toBe(true);
  expect(result.firstStart).toBeCloseTo(result.fallbackSeconds, 2);
  expect(result.undo[1]).toBe(result.undo[0]);
  expect(result.xmlRestored).toBe(true);
});
