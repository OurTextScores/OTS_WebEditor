#!/usr/bin/env bash
# Compatibility entry point; production tooling lives in tools/musescore/.
set -euo pipefail
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/../musescore/build.sh" "$@"
