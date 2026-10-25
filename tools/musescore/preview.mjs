import { readFile, writeFile } from 'node:fs/promises';
import { createSvgRenderer } from './svgcheck.mjs';
const svgFile = process.argv[2] || '/tmp/ms47-bridge-results/0-before.svg';
const pngFile = process.argv[3] || '/tmp/ms47-bridge-results/preview.png';
const renderer = await createSvgRenderer();
try {
  const { png, info } = await renderer.render(await readFile(svgFile, 'utf8'));
  await writeFile(pngFile, png);
  console.log(JSON.stringify({ ...info, pngFile }, null, 2));
} finally { await renderer.close(); }
