#!/usr/bin/env bash
# Reproduce the MuseScore 4.7 Qt-free engine spike (see README.md).
#
#   spikes/ms47/setup.sh [native|wasm|all]
#
# Environment (defaults in brackets):
#   MUSESCORE_REPO  upstream MuseScore clone with the v4.7.4 tag [~/workspace/MuseScore]
#   SPIKE_DIR       worktree to create                         [~/workspace/ms47-spike]
#   EMSDK_DIR       emsdk with 4.0.7 installed and activated   [~/workspace/emsdk-4.0.7]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUSESCORE_REPO="${MUSESCORE_REPO:-$HOME/workspace/MuseScore}"
SPIKE_DIR="${SPIKE_DIR:-$HOME/workspace/ms47-spike}"
EMSDK_DIR="${EMSDK_DIR:-$HOME/workspace/emsdk-4.0.7}"
TARGET="${1:-all}"

CMAKE_FLAGS=(
    -G Ninja
    -DMS47_SPIKE_ENGINE_ONLY=ON
    # SetupConfigure writes muse_framework_config.h before any later override,
    # so these must come from the command line.
    -DMUSE_QT_SUPPORT=OFF
    -DMUSE_ENABLE_UNIT_TESTS=OFF
    -DMUSE_MODULE_DRAW_USE_QTFONTMETRICS=OFF
)

if [ ! -d "$SPIKE_DIR" ]; then
    git -C "$MUSESCORE_REPO" worktree add --detach "$SPIKE_DIR" v4.7.4
    git -C "$SPIKE_DIR" apply "$HERE/upstream-v4.7.4-noqt.patch"
fi
mkdir -p "$SPIKE_DIR/spike"
cp "$HERE/SpikeEngineOnly.cmake" "$HERE/spike_main.cpp" "$HERE/stage_resources.py" "$SPIKE_DIR/spike/"

RES_DIR="$SPIKE_DIR/../ms47-build-native/res"
rm -rf "$RES_DIR"
python3 -I "$HERE/stage_resources.py" "$SPIKE_DIR" "$RES_DIR"

if [ "$TARGET" = native ] || [ "$TARGET" = all ]; then
    cmake -S "$SPIKE_DIR" -B "$SPIKE_DIR/../ms47-build-native" -DCMAKE_BUILD_TYPE=RelWithDebInfo "${CMAKE_FLAGS[@]}"
    ninja -C "$SPIKE_DIR/../ms47-build-native" ms47_spike
    echo "native: $SPIKE_DIR/../ms47-build-native/ms47_spike $RES_DIR <score> <outdir>"
fi

if [ "$TARGET" = wasm ] || [ "$TARGET" = all ]; then
    # shellcheck disable=SC1091
    source "$EMSDK_DIR/emsdk_env.sh" >/dev/null
    emcmake cmake -S "$SPIKE_DIR" -B "$SPIKE_DIR/../ms47-build-wasm" -DCMAKE_BUILD_TYPE=Release "${CMAKE_FLAGS[@]}"
    ninja -C "$SPIKE_DIR/../ms47-build-wasm"
    echo "wasm:   node $SPIKE_DIR/build.artifacts/ms47_spike.js $RES_DIR <score> <outdir>"
fi
