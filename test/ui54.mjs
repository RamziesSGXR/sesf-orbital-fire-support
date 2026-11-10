// 0.54 in the browser: the names of buildings and enemies are hidden on the map unless Settings > Show names is on or they are under the aim; Hide UI hides every map label.
//   node test/ui54.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
const page = await (await b.newContext({viewport:{width:1100,height:700}})).newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.addInitScript(()=>{ window.__txt=[]; const f=CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText=function(t,...a){ window.__txt.push(String(t)); return f.call(this,t,...a); }; });
const PAGE=`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5252&faction=bots&biome=grass&tod=12`;
const ev=(f,a)=>page.evaluate(f,a), click=(id)=>ev(id=>document.getElementById(id).click(),id), wait=ms=>page.waitForTimeout(ms);
await page.goto(PAGE); await wait(300); await ev(()=>{localStorage.clear();localStorage.setItem('ofs.notice','true');}); await page.goto(PAGE); await wait(900);
await click('btn-play'); await wait(300); await ev(()=>{document.getElementById('callsign').value='n';}); await click('btn-lock'); await wait(300);
await click('shop-go'); await page.waitForFunction(()=>!document.getElementById('b-continue').disabled,null,{timeout:30000}); await click('b-continue');
await page.waitForFunction(()=>{const m=window.__game.mission;return m&&m.hdAlive.length&&m.bases.length;},null,{timeout:60000}); await wait(800);
// put a rocketeer in view
await ev(()=>{const G=window.__game,m=G.mission,a=m.hdAlive[0]; const e=m.enemies.find(e=>!e.dead&&e.kind==='M')||m.enemies.find(e=>!e.dead); e.kind='M'; e.v='rkt'; e.hp=e.maxHp=1e6; e.x=a.x+25; e.y=a.y+10; e.vis=2; e.g.state='patrol'; e.g.pt={x:e.x,y:e.y}; e.g.patrolT=1e9; G.cam.follow=true; m.dirtyE=true;});
const grab = async () => { await ev(() => { window.__txt.length = 0; }); await wait(400); return ev(() => [...new Set(window.__txt)]); };
const has = (t) => t.includes('ROCKETEER');
check('names off by default: an enemy\'s name is not on the map', !has(await grab()));
await ev(() => window.__game.setSetting('showNames', true));
check('Settings > Show names puts it back', has(await grab()));
await ev(() => window.__game.setSetting('showNames', false));
const sp = await ev(() => { const G = window.__game, e = G.mission.enemies.find((x) => x.v === 'rkt'); return G.renderer.worldToScreen(e.x, e.y, document.getElementById('game') || document.querySelector('canvas')); });
await page.mouse.move(sp.x, sp.y); await wait(200);
check('under the aim, the name shows with names off', has(await grab()));
await page.mouse.move(5, 5);
await ev(() => window.__game.setSetting('showNames', true)); await ev(() => window.__game.setHideUi(true));
check('Hide UI takes every map name with it', !has(await grab()));
check('no page errors', errs.length === 0, errs[0] || '');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
