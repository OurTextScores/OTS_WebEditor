#!/usr/bin/env bash
set -euo pipefail
spike_tools=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
workspace=$(cd "$spike_tools/../../.." && pwd)
source_dir=${MS47_SOURCE:-$workspace/ms47-spike}
build_dir=${MS47_BUILD:-$workspace/ms47-build-wasm}
resource_dir=${MS47_RESOURCE_ROOT:-$workspace/ms47-build-native/res}
emsdk_dir=${MS47_EMSDK:-$workspace/emsdk-4.0.7}
if [[ ! -d "$source_dir" ]]; then
    git -C "$workspace/MuseScore" worktree add --detach "$source_dir" v4.7.4
fi
if [[ $(git -C "$source_dir" rev-parse HEAD) != $(git -C "$source_dir" rev-parse v4.7.4) ]]; then
    echo 'Expected a MuseScore v4.7.4 checkout' >&2
    exit 1
fi
if git -C "$source_dir" apply --reverse --check "$spike_tools/upstream-v4.7.4-noqt.patch" 2>/dev/null; then
    : # Existing build spike already has the patches.
else
    git -C "$source_dir" apply --check "$spike_tools/upstream-v4.7.4-noqt.patch"
    git -C "$source_dir" apply "$spike_tools/upstream-v4.7.4-noqt.patch"
fi
mkdir -p "$source_dir/spike"
cp "$spike_tools/SpikeEngineOnly.cmake" "$spike_tools/bridge.cpp" "$spike_tools/"*.h "$source_dir/spike/"
python3 "$spike_tools/stage_resources.py" "$source_dir" "$resource_dir"
# emsdk_env.sh may reference unset variables.
set +u
source "$emsdk_dir/emsdk_env.sh"
set -u
emcmake cmake -S "$source_dir" -B "$build_dir" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DMS47_SPIKE_ENGINE_ONLY=ON -DMUSE_QT_SUPPORT=OFF -DMUSE_ENABLE_UNIT_TESTS=OFF \
    -DMUSE_MODULE_DRAW_USE_QTFONTMETRICS=OFF -DMS47_BRIDGE_FAST_LINK="${MS47_FAST_LINK:-OFF}"
export BINARYEN_CORES=${MS47_JOBS:-2}
cmake --build "$build_dir" --target ms47_bridge --parallel "${MS47_JOBS:-2}"
