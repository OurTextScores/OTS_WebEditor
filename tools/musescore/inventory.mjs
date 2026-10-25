// Enumerate actual exports rather than trusting the historical count in docs.
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const current = await readFile(new URL('webmscore-fork/web/main.cpp', root), 'utf8');
const bridge = new URL('engine/musescore/bridge/', root);
const files = (await readdir(bridge)).filter(name => /\.(cpp|h)$/.test(name)).sort();
const port = (await Promise.all(files.map(name => readFile(new URL(name, bridge), 'utf8')))).join('\n');
const names = source => [...source.matchAll(/EMSCRIPTEN_KEEPALIVE\s+(?:const\s+)?[\w:*]+\s+(\w+)\s*\(/g)].map(m => m[1]);
const ported = new Set(names(port));
console.log(JSON.stringify({ total: names(current).length, implemented: [...ported].sort(), remaining: names(current).filter(name => !ported.has(name)) }, null, 2));
