"""Post-link fix for webmscore.lib.js (the browser package). Usage: python3 patch_lib.py <webmscore.lib.js>

emscripten 4's ES-module output gets Node's `require` with `const {createRequire} = await import("module")`. Bundlers
for the browser (Next/webpack building the editor's in-process runtime) try to resolve that import and fail, although
the branch only runs in Node, and web-public's Babel step strips any webpackIgnore comment. The Node branch only needs
builtins (fs, path, url, crypto), which process.getBuiltinModule (Node >= 20.16) provides without an import.
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
    open(path, "w", encoding="utf-8").write(text)
