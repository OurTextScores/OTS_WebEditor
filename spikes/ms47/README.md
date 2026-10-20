# MuseScore 4.7 Qt-free engine spike

Upstream MuseScore `v4.7.4` (`7688c005ad`) built as a headless engine (engraving + MusicXML) **without Qt**,
natively and to WASM with emsdk 4.0.7. This was the go/no-go test for resyncing `webmscore-fork` (4.00) to a current
upstream. Not wired into the app; `webmscore-fork` is still the shipping engine.

## Result (2026-10-20)

- Builds with `MUSE_QT_SUPPORT=OFF` plus upstream's `GLOBAL_/ENGRAVING_/MUSICXML_NO_INTERNAL` and
  `ENGRAVING_NO_ACCESSIBILITY` switches, after the 63-line patch in `upstream-v4.7.4-noqt.patch`. No Qt6 WASM kit needed.
- `.wasm` 8.76 MB / 2.76 MB gzip (the fork's is 9.27 / 3.02, but also carries playback and image export).
- Faster than the fork in Node at load, layout, MSCZ save and MusicXML export. faure.mscz load+layout: 1.93 s vs 2.24 s.
- Reads the 4.1–4.7 content the fork drops or misreads: 4.2–4.4 files, `concertKey`/`actualKey`, `<br/>`, ornaments,
  split tremolos, capo, guitar bends, partial ties, system locks.
- Not done: the JS bridge, a Qt-free SVG writer (paint into `DrawData` works), PNG/PDF, playback.

## Files

| File | Purpose |
|---|---|
| `upstream-v4.7.4-noqt.patch` | Changes to upstream: engine-only CMake switch, Qt-free freetype font provider, logger/`String` stream fixes, `ushort` |
| `SpikeEngineOnly.cmake` | Builds global, draw, engraving, musicxml and the harness; Emscripten link options |
| `spike_main.cpp` | Harness: stub `IFileSystem` (serves `:/` resources from disk), engraving/app/MusicXML configurations, font bootstrap, then load → layout → save MSCZ → MusicXML → paint page 1 |
| `stage_resources.py` | Copies the engraving `.qrc` contents (fonts, styles, instruments) into a plain directory |
| `fork_time.cjs` | Times the same stages on the current 4.00 fork's Node build, for comparison |
| `setup.sh` | Creates the worktree, applies the patch, stages resources, builds native and/or WASM |

## Run

```bash
spikes/ms47/setup.sh all            # or: native | wasm
~/workspace/ms47-build-native/ms47_spike ~/workspace/ms47-build-native/res score.mscz /tmp/out
node ~/workspace/ms47-spike/build.artifacts/ms47_spike.js ~/workspace/ms47-build-native/res score.mscz /tmp/out
node spikes/ms47/fork_time.cjs webmscore-fork/web-public/webmscore.nodejs.cjs score.mscz
```

The harness prints one JSON line with part/measure/page counts, output sizes and per-stage milliseconds, and writes
`out.mscz`, `out.musicxml` and `page1.drawdata.json`.

Full write-up, including what a real resync still needs: `docs/private/MS47_BUILD_SPIKE.md` (local only).
