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
cp "$spike_tools/SpikeEngineOnly.cmake" "$spike_tools/bridge.cpp" "$spike_tools/"*.h "$spike_tools/patch_lib.py" "$source_dir/spike/"
python3 "$spike_tools/stage_resources.py" "$source_dir" "$resource_dir"
# Browser preload: the staged root minus lazy-resources.json (fetched on demand by index.js)
preload_dir="$resource_dir-preload"
python3 -I - "$resource_dir" "$preload_dir" "$spike_tools/lazy-resources.json" <<'PY'
import hashlib, json, os, shutil, sys
src, dst, manifest = sys.argv[1:4]
lazy = set(json.load(open(manifest))["files"])
wanted = {}
for root, _, files in os.walk(src):
    for name in files:
        rel = os.path.relpath(os.path.join(root, name), src).replace(os.sep, "/")
        if rel not in lazy:
            wanted[rel] = os.path.join(root, name)
digest = hashlib.sha256()
for rel in sorted(wanted):
    target = os.path.join(dst, rel)
    st = os.stat(wanted[rel])
    digest.update(f"{rel}:{st.st_size}:{st.st_mtime_ns}".encode())
    if not os.path.exists(target) or os.path.getsize(target) != st.st_size or os.path.getmtime(target) < st.st_mtime:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(wanted[rel], target)
for root, _, files in os.walk(dst):
    for name in files:
        rel = os.path.relpath(os.path.join(root, name), dst).replace(os.sep, "/")
        if rel not in wanted:
            os.remove(os.path.join(root, name))
stamp = dst + ".stamp"
if not os.path.exists(stamp) or open(stamp).read() != digest.hexdigest():
    open(stamp, "w").write(digest.hexdigest())
PY
# emsdk_env.sh may reference unset variables.
set +u
source "$emsdk_dir/emsdk_env.sh"
set -u
# The framework config header is generated before SpikeEngineOnly.cmake runs, so these must be set here too
emcmake cmake -S "$source_dir" -B "$build_dir" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DMS47_SPIKE_ENGINE_ONLY=ON -DMUSE_QT_SUPPORT=OFF -DMUSE_ENABLE_UNIT_TESTS=OFF \
    -DMUSE_MODULE_DRAW_USE_QTFONTMETRICS=OFF -DMS47_BRIDGE_FAST_LINK="${MS47_FAST_LINK:-OFF}" \
    -DMS47_WITH_PLAYBACK="${MS47_WITH_PLAYBACK:-ON}" \
    -DMUSE_CONFIGURATION_IS_WEB=ON -DMUSE_THREADS_SUPPORT=OFF -DMUSE_MODULE_AUDIO_EXPORT=OFF \
    -DMS47_BROWSER="${MS47_BROWSER:-ON}" -DMS47_PRELOAD_DIR="$preload_dir"
export BINARYEN_CORES=${MS47_JOBS:-2}
targets=(ms47_bridge)
[[ "${MS47_BROWSER:-ON}" == ON ]] && targets+=(webmscore_lib)
cmake --build "$build_dir" --target "${targets[@]}" --parallel "${MS47_JOBS:-2}"
