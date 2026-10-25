"""Check the port with configured upstream flags, without relinking WASM."""
from pathlib import Path
import os
import shlex
import subprocess

here = Path(__file__).resolve().parent
workspace = here.parents[2]
build = Path(os.environ.get("MS47_BUILD", workspace / "ms47-build-wasm"))
commands = subprocess.check_output(
    ["ninja", "-C", str(build), "-t", "commands", "ms47_bridge"], text=True
)
compile_line = next(
    line for line in commands.splitlines()
    if " -c " in line and "spike/bridge.cpp" in line
)
args = shlex.split(compile_line)
checked = []
i = 0
while i < len(args):
    if args[i] in ("-o", "-MT", "-MF"):
        i += 2
        continue
    if args[i] in ("-MD", "-c"):
        i += 1
        continue
    if args[i].endswith("/spike/bridge.cpp"):
        checked.append(str(here.parents[1] / "engine/musescore/bridge/bridge.cpp"))
    else:
        checked.append(args[i])
    i += 1
checked.append("-fsyntax-only")
raise SystemExit(subprocess.call(checked))
