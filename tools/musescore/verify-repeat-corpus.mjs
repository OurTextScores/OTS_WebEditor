import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * MuseScore's own repeat test suite (src/engraving/tests/repeat_data, 69 scores) as a traversal corpus: for each
 * score, the expected played measure numbers from repeat_tests.cpp must equal the order of our playback timeline and
 * of the follow map's occurrences. Displayed numbers come from the MusicXML export, so section-break restarts compare
 * like the upstream test (which uses Measure::no() + 1).
 */
export async function verifyRepeatCorpus(W, source) {
  const tests = await readFile(path.join(source, 'src/engraving/tests/repeat_tests.cpp'), 'utf8');
  const cases = [...tests.matchAll(/repeat\("([^"]+)",\s*u"([^"]*)"\)/g)].map(([, file, ref]) => ({
    file,
    expected: ref.split(';').map((s) => s.trim()).filter(Boolean),
  }));
  assert.ok(cases.length >= 60, `found ${cases.length} repeat cases`);
  const failures = [];
  for (const { file, expected } of cases) {
    const bytes = new Uint8Array(await readFile(path.join(source, 'src/engraving/tests/repeat_data', file)));
    const score = await W.load('mscx', bytes);
    try {
      const saved = await score.saveXml();
      const xml = typeof saved === "string" ? saved : new TextDecoder().decode(saved);
      const part = xml.split(/<part id=/)[1] ?? '';
      const numbers = [...part.matchAll(/<measure[^>]*number="([^"]+)"/g)].map((m) => m[1]);
      const timeline = await score.playbackTimeline();
      const map = await score.playbackFollowMap();
      const played = timeline.occurrences.map((o) => numbers[o.measureIndex]);
      const fromMap = [];
      for (const interval of map.intervals) {
        const key = `${interval.occurrenceIndex}`;
        if (fromMap.at(-1)?.key !== key) fromMap.push({ key, number: numbers[interval.measureIndex] });
      }
      const mapped = fromMap.map((o) => o.number);
      if (played.join(';') !== expected.join(';') || mapped.join(';') !== played.join(';'))
        failures.push({ file, expected: expected.join(';'), timeline: played.join(';'), map: mapped.join(';') });
    } finally {
      score.destroy();
    }
  }
  const report = { cases: cases.length, failures };
  console.log(`verified repeat corpus: ${cases.length - failures.length}/${cases.length} upstream repeat scores match`);
  return report;
}
