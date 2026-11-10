// 0.53.12: save codes (session.js runToCode / codeToRun). A run goes out as text and comes back the same; a code cut short,
// mistyped, from before the 0.53 reset or from a newer game is turned away with the reason; spaces and line breaks don't matter.
//   node test/r5312.mjs
import { newSession, runToCode, codeToRun, codeSum, SAVE_VER } from '../js/session.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const b64u = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const plain = (o) => { const d = b64u(JSON.stringify(o)); return `OFS0-${d}-${codeSum(d)}`; };

const s = newSession('CODER', 5);
s.wallet.bal = 4321; s.slot = 2; s.noSave = true;
s.missions.push({ op: 'Operation Test', faction: 'bots', biome: 'grass', outcome: 'victory', score: 900, ships: ['SES Fist of Peace'] });
const code = await runToCode('session', s);
check('a code: OFS1 (deflated), the data, and a four-character check', /^OFS1-[A-Za-z0-9_-]+-[0-9A-Z]{4}$/.test(code), `${code.length} chars`);
let r = await codeToRun(code);
check('it comes back as the same run, QUICK PLAY\'s', r.key === 'session' && r.run.callsign === 'CODER' && r.run.wallet.bal === 4321 && r.run.missions.length === 1 && r.run.missions[0].ships[0] === 'SES Fist of Peace' && JSON.stringify(r.run.kit) === JSON.stringify(s.kit));
check('...without the slot it had on the browser it came from (it takes a free one where it is loaded)', !('slot' in r.run) && !('noSave' in r.run));
check('the run itself is left as it was', s.slot === 2 && s.noSave === true);
r = await codeToRun(code.replace(/(.{40})/g, '$1\n  ') + '  ');
check('spaces and line breaks pasted with it don\'t matter', r.run && r.run.callsign === 'CODER');
const camp = await codeToRun(await runToCode('campRun', { ...s, story: { id: 'liberty', ch: 3 } }));
check('a campaign run comes back as the campaign\'s', camp.key === 'campRun' && camp.run.story.ch === 3);
check('nothing pasted: empty', (await codeToRun('   ')).err === 'empty');
check('cut short: bad', (await codeToRun(code.slice(0, -7) + code.slice(-5))).err === 'bad');
const i = 30, typo = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
check('one character wrong: bad', (await codeToRun(typo)).err === 'bad');
check('not a code at all: bad', (await codeToRun('hello there')).err === 'bad');
const s2 = JSON.parse(JSON.stringify(s)); delete s2.slot;
check('an uncompressed code (OFS0) loads too', (await codeToRun(plain({ v: SAVE_VER, k: 's', r: s2 }))).run.wallet.bal === 4321);
check('from before the 0.53 reset: old', (await codeToRun(plain({ v: SAVE_VER - 1, k: 's', r: s2 }))).err === 'old');
check('from a newer game: new', (await codeToRun(plain({ v: SAVE_VER + 1, k: 's', r: s2 }))).err === 'new');
check('a tutorial run, or no missions list: bad', (await codeToRun(plain({ v: SAVE_VER, k: 's', r: { ...s2, tutorial: true } }))).err === 'bad' && (await codeToRun(plain({ v: SAVE_VER, k: 's', r: { callsign: 'X' } }))).err === 'bad');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
