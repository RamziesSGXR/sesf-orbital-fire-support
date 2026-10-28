// Language checks: the three tables hold the same keys with the same {placeholders}; every key the code and the page ask for exists;
// every line renders without a leftover {name}; short HUD labels fit; and whole missions run in French and Spanish with no raw key
// reaching the radio, the notices or the chatter. Run: node test/i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import EN from '../js/lang/en.js';
import FR from '../js/lang/fr.js';
import ES from '../js/lang/es.js';
import { setLang, t } from '../js/i18n.js';
import { STRATS } from '../js/data/strat.js';
import { Mission } from '../js/sim/mission.js';
import { makeBot, botStep } from '../js/sim/bot.js';

let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!ok) fails++; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TABLES = { fr: FR, es: ES };
const holes = (s) => new Set((typeof s === 'string' ? s.match(/\{(\w+)\}/g) : null) || []);
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
// Any {name} gets a value (2 works both as a number and in text).
const SAMPLE = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? 2 : undefined), has: () => true });

// ---------------------------------------------------------------- the tables match
{
  const en = Object.keys(EN);
  for (const [l, T] of Object.entries(TABLES)) {
    const miss = en.filter((k) => T[k] === undefined), extra = Object.keys(T).filter((k) => EN[k] === undefined);
    check(`${l}: every English key is translated`, miss.length === 0, miss.slice(0, 8).join(', '));
    check(`${l}: no key the English table lacks`, extra.length === 0, extra.slice(0, 8).join(', '));
    const bad = [];
    for (const k of en) {
      const a = EN[k], b = T[k];
      if (b === undefined) continue;
      if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) { bad.push(k + ' (type)'); continue; }
      if (typeof a === 'string' && !same(holes(a), holes(b))) bad.push(k);
      if (Array.isArray(a)) {
        const all = new Set(a.flatMap((x) => [...holes(x)]));
        if (b.some((x) => [...holes(x)].some((h) => !all.has(h)))) bad.push(k + ' (list)');
        if (!b.length) bad.push(k + ' (empty list)');
      }
    }
    check(`${l}: same {placeholders} and shapes as English`, bad.length === 0, bad.slice(0, 8).join(', '));
  }
}

// ---------------------------------------------------------------- every line renders
for (const l of ['en', 'fr', 'es']) {
  setLang(l);
  const bad = [];
  for (const k of Object.keys(EN)) {
    const v = (l === 'en' ? EN : TABLES[l])[k];
    if (Array.isArray(v)) { for (const x of v) if (typeof x !== 'string' || !x.trim()) bad.push(k); continue; }
    let s;
    try { s = t(k, SAMPLE); } catch (e) { bad.push(k + ' (threw)'); continue; }
    if (typeof s !== 'string' || /undefined|NaN|\[object/.test(s) || /\{\w+\}/.test(s)) bad.push(k);
  }
  check(`${l}: every line renders (no leftover {name}, no undefined)`, bad.length === 0, bad.slice(0, 8).join(', '));
}
setLang('en');

// ---------------------------------------------------------------- the code and the page ask only for keys that exist
{
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'lang') walk(p); } else if (f.endsWith('.js') && f !== 'i18n.js') files.push(p); } };
  walk(path.join(ROOT, 'js'));
  const keys = new Set(Object.keys(EN));
  const missing = [], prefixes = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const mm of src.matchAll(/\b(?:t|tr|tl|tEn)\(\s*'([^'\n]+)'\s*([,)+])/g)) {
      const [, k, next] = mm;
      if (next === '+') prefixes.push([k, path.basename(f)]);
      else if (!keys.has(k)) missing.push(`${path.basename(f)}: ${k}`);
    }
    for (const mm of src.matchAll(/\b(?:t|tr|tl|tEn)\(\s*`([^`$]+)\$\{/g)) prefixes.push([mm[1], path.basename(f)]);
  }
  check('every literal key the code uses is in the English table', missing.length === 0, missing.slice(0, 8).join('; '));
  const deadPre = prefixes.filter(([p]) => ![...keys].some((k) => k.startsWith(p)));
  check('every key prefix the code builds on has keys under it', deadPre.length === 0, deadPre.slice(0, 8).map((x) => x.join(' in ')).join('; '));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = [...html.matchAll(/data-t[htap]?="([^"]+)"/g)].map((x) => x[1]);
  const domMiss = dom.filter((k) => !keys.has(k));
  check(`every key the page asks for exists (${dom.length} on the page)`, dom.length > 50 && domMiss.length === 0, domMiss.slice(0, 8).join(', '));
}

// ---------------------------------------------------------------- stratagems, and short labels that fit the weapon bar
{
  const ids = Object.keys(STRATS);
  const noName = ids.filter((id) => EN['strat.' + id] === undefined || EN['strat.' + id + '.b'] === undefined);
  check('every stratagem has a name and a blurb', noName.length === 0, noName.join(', '));
  for (const l of ['en', 'fr', 'es']) {
    setLang(l);
    const long = ids.filter((id) => STRATS[id].cat === 'ORBITAL').map((id) => [id, t('strat.' + id + '.s')]).filter(([, s]) => s.length > 10);
    check(`${l}: orbital short names fit the weapon bar (10 letters or fewer)`, long.length === 0, long.map((x) => x.join('=')).join(', '));
    check(`${l}: stratagem names follow the language`, l === 'en' || STRATS.orb_120.name !== EN['strat.orb_ems'] && STRATS.orb_ems.name === (l === 'fr' ? FR : ES)['strat.orb_ems']);
  }
  setLang('en');
}

// ---------------------------------------------------------------- whole missions in each language
const RAW = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;
for (const l of ['fr', 'es']) {
  setLang(l);
  let lines = 0;
  const raw = [], errs = [];
  for (const fac of ['bugs', 'bots', 'squids']) {
    try {
      const m = new Mission({ seed: 4242 + fac.length, faction: fac, biome: 'grass', events: true, sessionMinutes: 0, missionN: 1 });
      const bot = makeBot();
      for (let s = 0; s < 30 * 240 && !m.over; s++) {
        botStep(m, bot); m.step(1 / 30);
        if (m.events.length) {
          for (const e of m.events) if (typeof e.text === 'string') { lines++; if (RAW.test(e.text) || /\{\w+\}|undefined/.test(e.text)) raw.push(e.text); }
          m.events.length = 0;
        }
      }
      const st = m.objectives.map((o) => o.type);
      if (!st.length) errs.push(fac + ': no objective');
    } catch (e) { errs.push(`${fac}: ${e.message}`); }
  }
  check(`${l}: four minutes on each front run without an error`, errs.length === 0, errs.join('; '));
  check(`${l}: no raw key or {name} on the radio, the notices or the chatter`, lines > 30 && raw.length === 0, `${lines} lines; ${raw.slice(0, 4).join(' | ')}`);
}
setLang('en');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
