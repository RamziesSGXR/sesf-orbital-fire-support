// 0.50 Armory & SEAF in the browser: all five loadout slots open; the TROOP MIX row (STANDARD on, ANTI-ARMOUR and MEDICAL shut
// until Specialists / Field Medics are bought, then picked and kept); PAY IN on something you can't afford yet, the paid bar, and
// the price left; Leader Command's name and line.   node test/ui50.mjs [desktop|portrait]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const VP = { desktop: { width: 1280, height: 800 }, portrait: { width: 393, height: 780 } };
const vp = process.argv[2] || 'desktop', touch = vp !== 'desktop';
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: VP[vp] || VP.portrait, hasTouch: touch, isMobile: touch });
await ctx.addInitScript(() => { window.__feedSink = () => {}; });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
const PAGE = `file://${ROOT}/dist/orbital-fury.html?skipstart&seed=5050&faction=bots&biome=grass&tod=12`;
const ev = (f, a) => page.evaluate(f, a);
const click = (id) => ev((id) => document.getElementById(id).click(), id);
const wait = (ms) => page.waitForTimeout(ms);
const tab = (id) => ev((id) => document.querySelector(`.shop-tabs .tab[data-tab="${id}"]`).click(), id);

await page.goto(PAGE); await wait(300);
await ev(() => { localStorage.clear(); localStorage.setItem('ofs.notice', 'true'); });
await page.goto(PAGE); await wait(900);
await click('btn-play'); await wait(300);
await ev(() => { document.getElementById('callsign').value = 'ui50'; });
await click('btn-lock'); await wait(300);
check('in the armory', (await ev(() => window.__game.state)) === 'shop');

// slots
const slots = await ev(() => [...document.querySelectorAll('#shop-root .shop-lo .slot')].map((s) => s.className));
check('five loadout slots, none locked, none for sale', slots.length === 5 && slots.every((c) => !/locked/.test(c)) && !(await ev(() => [...document.querySelectorAll('.tabpane .it-name')].some((n) => /ORBITAL SLOT/i.test(n.textContent)))), slots.join(' | '));

// the troop mix
const mix = () => ev(() => [...document.querySelectorAll('#shop-root .shop-mix .btn.mix')].map((b) => ({ k: b.dataset.mix, on: b.classList.contains('on'), dis: b.disabled, t: b.textContent })));
let mx = await mix();
check('a TROOP MIX row: STANDARD on, ASSAULT open, ANTI-ARMOUR and MEDICAL shut', mx.length === 4 && mx[0].on && !mx[1].dis && mx[2].dis && /NEEDS SPECIALISTS/.test(mx[2].t) && mx[3].dis && /NEEDS FIELD MEDICS/.test(mx[3].t), JSON.stringify(mx));
await ev(() => document.querySelector('#shop-root .shop-mix .btn.mix[data-mix="assault"]').click()); await wait(100);
check('ASSAULT picked, and kept on the kit', (await ev(() => window.__game.session.kit.mix)) === 'assault' && (await mix())[1].on && /TROOP MIX: ASSAULT/.test(await ev(() => document.querySelector('#shop-root .shop-cr .note').textContent)));
await ev(() => { const s = window.__game.session; s.wallet.bal = 5000; s.kit.seaf.rocket = 1; window.__game.goShop(); }); await wait(150);
mx = await mix();
check('Specialists bought: ANTI-ARMOUR opens', !mx[2].dis && mx[3].dis, JSON.stringify(mx.map((x) => x.k + (x.dis ? '-' : '+'))));
await ev(() => document.querySelector('#shop-root .shop-mix .btn.mix[data-mix="armor"]').click()); await wait(100);
check('...and can be picked', (await ev(() => window.__game.session.kit.mix)) === 'armor');

// paying toward something
await ev(() => { const s = window.__game.session; s.wallet.bal = 500; window.__game.goShop(); }); await wait(150);
await tab('orb');
const card = await ev(() => { const c = [...document.querySelectorAll('.tabpane[data-tab="orb"] .item')].find((q) => q.querySelector('.btn.pay')); return c ? { name: c.querySelector('.it-name').textContent, pay: c.querySelector('.btn.pay').textContent, buy: c.querySelector('.btn.buy').textContent } : null; });
check('an item you can\'t afford yet offers PAY IN', card && /PAY IN/.test(card.pay), JSON.stringify(card));
const b0 = await ev(() => window.__game.session.wallet.bal);
await ev(() => [...document.querySelectorAll('.tabpane[data-tab="orb"] .item')].find((q) => q.querySelector('.btn.pay')).querySelector('.btn.pay').click()); await wait(150);
const paid = await ev(() => ({ bal: window.__game.session.wallet.bal, paid: window.__game.session.kit.paid, bar: [...document.querySelectorAll('.tabpane[data-tab="orb"] .it-paid')].map((x) => x.textContent), note: document.querySelector('#shop-root .shop-cr .note').textContent }));
const put = b0 - paid.bal;
check('PAY IN takes credits and keeps them on the item', put > 0 && Object.values(paid.paid).includes(put), JSON.stringify(paid.paid));
check('the card shows what is paid, and the note what is left', paid.bar.length === 1 && /OF [\d,]+ CR PAID/.test(paid.bar[0]) && /CR PAID TOWARD .*CR TO GO/.test(paid.note), `${paid.bar[0]} · ${paid.note}`);
const left = await ev(() => { const c = [...document.querySelectorAll('.tabpane[data-tab="orb"] .item')].find((q) => q.querySelector('.it-paid')); return c.querySelector('.btn.buy small').textContent; });
check('its price now shows only what is left to pay', /CR/.test(left) && Number(left.replace(/\D/g, '')) < Number(card.buy.replace(/\D/g, '')), `${card.buy} → ${left}`);
await ev(() => { const s = window.__game.session; s.wallet.bal = 99999; window.__game.goShop(); }); await wait(150);
await tab('orb');
await ev(() => [...document.querySelectorAll('.tabpane[data-tab="orb"] .item')].find((q) => q.querySelector('.it-paid')).querySelector('.btn.buy').click()); await wait(150);
check('buying it then pays the rest, and the deposit is used up', (await ev(() => Object.keys(window.__game.session.kit.paid).length)) === 0 && (await ev(() => 99999 - window.__game.session.wallet.bal)) === Number(left.replace(/\D/g, '')));

// Leader Command
await tab('seaf');
const lc = await ev(() => { const c = [...document.querySelectorAll('.tabpane .item')].find((q) => /Leader Command/.test(q.querySelector('.it-name').textContent)); return c ? c.textContent : null; });
check('Leader Command in the armory (Leader Radios is gone)', lc && /22 m/.test(lc) && !(await ev(() => /Leader Radios/.test(document.getElementById('shop-root').textContent))), lc && lc.slice(0, 120));

check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
