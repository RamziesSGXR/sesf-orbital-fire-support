// 0.62.1 no more stutter on buildings, points of interest and mission sites (render/relief.js raise):
//  - the kept picture is laid at the exact place, not rounded to whole pixels, so it glides with the ground as the camera sways;
//  - live: the walls and shadow are kept, the top is painted every frame (what moves in it moves smoothly), at the same place the
//    kept top would have been; baking() is true only while the walls are made;
//  - without live, the top stays in the kept picture (painted again only now and then), as before.
//   node test/r621.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.setContent('<!DOCTYPE html><html><body></body></html>');
const src = readFileSync(path.join(ROOT, 'js/render/relief.js'), 'utf8');
await page.addScriptTag({ type: 'module', content: `${src}
window.__run = () => {
  setFlat(false);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 300; return c; };
  const out = {};
  // a red square, 6 m across, standing 2 m tall, at (0, 0); the camera drifts by 0.23 px a frame
  const art = (log) => (c) => { log.push(baking() ? 'bake' : 'top'); c.fillStyle = '#ff0000'; c.fillRect(-3, -3, 6, 6); };
  for (const live of [false, true]) {
    const cv = mk(), ctx = cv.getContext('2d'), log = [], at = [], who = {};
    const di = ctx.drawImage.bind(ctx); ctx.drawImage = (img, ...a) => { if (a.length === 8) at.push([a[4], a[5]]); return di(img, ...a); };
    for (let i = 0; i < 10; i++) {
      reliefFrame(i * 0.05);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 300, 300);
      ctx.setTransform(8, 0, 0, 8, 150.37 + i * 0.23, 150.61);
      raise(ctx, who, 0, 0, 5, 2, art(log), { live, noShadow: true });
    }
    // where the red is in the last frame (its middle, in pixels)
    const d = ctx.getImageData(0, 0, 300, 300).data; let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) { const i = (y * 300 + x) * 4; if (d[i] > 200 && d[i + 1] < 60 && d[i + 3] > 200) { sx += x; sy += y; n++; } }
    out[live ? 'live' : 'kept'] = { tops: log.filter((s) => s === 'top').length, bakes: log.filter((s) => s === 'bake').length, at, mid: n ? [sx / n, sy / n] : null, n };
  }
  return out;
};` });
await page.waitForFunction(() => typeof window.__run === 'function');
const r = await page.evaluate(() => window.__run());
const K = r.kept, L = r.live;
check('kept: made once, its top not painted again each frame', K.bakes === 1 && K.tops === 0, `${K.bakes} made, ${K.tops} tops`);
check('kept: laid where it is, not on whole pixels', K.at.length === 10 && K.at.some(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y)), JSON.stringify(K.at.slice(0, 3)));
check('kept: it follows the camera smoothly (0.23 px a frame)', K.at.length === 10 && K.at.every(([x], i) => i === 0 || Math.abs(x - K.at[i - 1][0] - 0.23) < 1e-3));
check('live: the walls made once, the top painted every frame', L.bakes === 1 && L.tops === 10, `${L.bakes} made, ${L.tops} tops`);
check('live: the walls laid smoothly too', L.at.length === 10 && L.at.every(([x], i) => i === 0 || Math.abs(x - L.at[i - 1][0] - 0.23) < 1e-3));
check('live: the top is where the kept top is', K.mid && L.mid && Math.hypot(K.mid[0] - L.mid[0], K.mid[1] - L.mid[1]) < 0.6 && Math.abs(K.n - L.n) < K.n * 0.1, `${K.mid && K.mid.map((v) => v.toFixed(2))} vs ${L.mid && L.mid.map((v) => v.toFixed(2))}`);
check('no page errors', errs.length === 0, errs[0]);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
