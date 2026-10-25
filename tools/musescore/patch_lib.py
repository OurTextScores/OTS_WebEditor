"""Post-link fix for webmscore.lib.js (the browser package). Usage: python3 patch_lib.py <webmscore.lib.js>

emscripten 4's ES-module output gets Node's `require` with `const {createRequire} = await import("module")`. Bundlers
for the browser (Next/webpack building the editor's in-process runtime) try to resolve that import and fail, although
the branch only runs in Node, and web-public's Babel step strips any webpackIgnore comment. The Node branch only needs
builtins (fs, path, url, crypto), which process.getBuiltinModule (Node >= 20.16) provides without an import.

findWasmBinary falls back to `new URL("webmscore.lib.wasm", import.meta.url)`, which webpack treats as an asset import:
building the editor then needs webmscore.lib.wasm next to the glue, and that copy is untracked (a fresh clone has only
public/'s). The fallback never runs, because helper.js always supplies locateFile; keep the plain file name.
"""
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
original = 'const{createRequire}=await import("module");var require=createRequire(import.meta.url)'
replacement = 'var require=m=>process.getBuiltinModule(m)'
if replacement not in text:
    if text.count(original) != 1:
        sys.exit(f"patch_lib.py: expected one createRequire import in {path}, found {text.count(original)}")
    text = text.replace(original, replacement)
asset = 'return new URL("webmscore.lib.wasm",import.meta.url).href}'
plain = 'return "webmscore.lib.wasm"}'
if asset in text:
    if text.count(asset) != 1:
        sys.exit(f"patch_lib.py: expected one wasm URL fallback in {path}, found {text.count(asset)}")
    text = text.replace(asset, plain)
elif 'locateFile("webmscore.lib.wasm")}' + plain not in text:
    sys.exit(f"patch_lib.py: wasm URL fallback not found in {path}; check findWasmBinary")
open(path, "w", encoding="utf-8").write(text)
