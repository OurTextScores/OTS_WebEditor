import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Text is outlined (one <path data-text> per run, as the 4.00 SVG): locate a run's left edge in page units
export function runX(svg, text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const at = svg.indexOf(`data-text="${esc}"`);
  if (at < 0) return null;
  const dx = Number([...svg.slice(0, at).matchAll(/transform="matrix\(([^)]*)\)"/g)].at(-1)[1].split(' ')[4]);
  const d = svg.slice(at).match(/ d="([^"]*)"/)[1];
  const xs = [...d.matchAll(/[MLQC]\s*(-?[\d.]+),/g)].map(m => Number(m[1]));
  return dx + Math.min(...xs);
}

export async function createSvgRenderer() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  page.on("console", msg => { if (msg.type() === "warning" || msg.type() === "error") console.error("SVG browser:", msg.text().slice(0, 500)); });
  return {
    browserVersion: browser.version(),
    // textOnly: a page may hold only text (e.g. a page number and footer), so no path primitives are required
    async render(svg, { textOnly = false } = {}) {
      await page.setContent(`<style>body{margin:0;background:white}svg{width:850px;height:auto}</style>${svg}`);
      const info = await page.evaluate(async () => {
        await document.fonts.ready;
        const element = document.querySelector('svg');
        const serialized = new XMLSerializer().serializeToString(element);
        const parse = new DOMParser().parseFromString(serialized, 'image/svg+xml');
        if (parse.querySelector('parsererror')) throw new Error(parse.querySelector('parsererror').textContent);
        const canvas = document.createElement('canvas');
        canvas.width = 850;
        canvas.height = Math.ceil(850 * element.viewBox.baseVal.height / element.viewBox.baseVal.width);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const clone = element.cloneNode(true);
        clone.setAttribute('width', String(canvas.width)); clone.setAttribute('height', String(canvas.height));
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
        try {
          const image = new Image(); image.src = url; await image.decode();
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        } finally { URL.revokeObjectURL(url); }
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let inkPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] < 240 || pixels[i + 1] < 240 || pixels[i + 2] < 240) inkPixels++;
        }
        return {
          error: parse.querySelector('parsererror')?.textContent,
          fonts: [...document.fonts].map(f => ({ family: f.family, status: f.status })),
          paths: element.querySelectorAll('path,polygon,polyline').length,
          texts: element.querySelectorAll('text').length,
          inkPixels,
        };
      });
      assert.equal(info.error, undefined);
      assert.ok(textOnly ? info.paths + info.texts > 0 : info.paths > 0);
      assert.ok(info.fonts.every(f => f.status === 'loaded'), `All SVG fonts must load: ${JSON.stringify(info.fonts)}`);
      assert.ok(info.inkPixels > (textOnly ? 0 : 100), 'SVG must paint visible marks, not a blank page');
      return { png: await page.locator('svg').screenshot(), info };
    },
    async textBounds(svg, text) {
      await page.setContent(svg);
      return page.evaluate(async text => {
        await document.fonts.ready;
        const el = [...document.querySelectorAll('[data-text]')].find(el => el.getAttribute('data-text') === text);
        if (!el) throw new Error(`Missing SVG text: ${text}`);
        const box = el.getBBox();

        const transform = document.querySelector('svg').getCTM().inverse().multiply(el.getCTM());
        const topLeft = new DOMPoint(box.x, box.y).matrixTransform(transform);
        const bottomRight = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform);
        return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
      }, text);
    },
    async textPoint(svg, text) {
      const box = await this.textBounds(svg, text);
      return [box.x + box.width / 2, box.y + box.height / 2];
    },
    close: () => browser.close(),
  };
}
