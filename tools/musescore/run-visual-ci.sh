#!/usr/bin/env bash
set -euo pipefail

# Run inside the pinned Playwright image, from the checkout root.
# Output is new and separate from the checked-in baseline.
: "${OTS_VISUAL_ENVIRONMENT:?Set OTS_VISUAL_ENVIRONMENT to the pinned image digest}"
baseline=${1:?Usage: run-visual-ci.sh BASELINE OUTPUT}
output=${2:?Usage: run-visual-ci.sh BASELINE OUTPUT}
mkdir "$output"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/build/browser"
cp webmscore-fork/web-public/webmscore.lib.js public/webmscore.lib.wasm public/webmscore.lib.data "$tmp/build/browser/"
node tools/musescore/bundle.mjs "$tmp/bundle" "$tmp/build"
node tools/musescore/capture-visual.mjs "$tmp/bundle" "$output/current" "$output/fidelity"
visual_status=0
node tools/musescore/visual-report.mjs "$baseline" "$output/current" "$output/report" || visual_status=$?
# Generate review artifacts even when the visual gate detects a difference.
review_status=0
review_args=()
if [[ -n ${OTS_VISUAL_REVIEW_DECISIONS:-} ]]; then review_args+=("$OTS_VISUAL_REVIEW_DECISIONS"); fi
node tools/musescore/review-report.mjs "$output/report" "${review_args[@]}" || review_status=$?
if (( visual_status != 0 )); then exit "$visual_status"; fi
exit "$review_status"
