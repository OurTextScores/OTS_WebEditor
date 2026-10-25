# MuseScore engine

This is OTS_Web's production MuseScore v4.7.4 native bridge, accepted and merged in `3e7f067c`.
[`upstream.json`](upstream.json) pins the upstream commit and Emscripten version.

- `bridge/`: maintained C ABI and domain headers, including audio and timeline exports.
- `patches/`: tracked changes required by the Qt-free build. Preserve upstream GPL notices.
- `cmake/`: production engine target configuration.
- `resources/`: preload/on-demand resource manifest.
- [`../../tools/musescore/`](../../tools/musescore/): executable build, bundle, install and verification tools.
- [`../../docs/engine/README.md`](../../docs/engine/README.md): build, validation, artifacts and diagnostics.

`webmscore-fork/web-public/src/` owns the maintained JS/worker ABI. The other 4.00 native sources under
`webmscore-fork/` are legacy; do not build or modify them expecting to change the production engine.
The upstream worktree's generated `spike/` directory is staging only. Never edit those copies.

The pinned upstream patch retains the `MS47_SPIKE_ENGINE_ONLY` hook, `spike/SpikeEngineOnly.cmake` staging
name and `ms47_bridge` target for compatibility. Production source ownership is here; renaming those
internal build hooks is unnecessary for this mechanical promotion.
