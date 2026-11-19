// 0.62.22 in the browser: Twitch chat. A stand-in for Twitch's chat server (window.__TwitchSocket) plays the part of a channel:
// the streamer connects from Settings, chatters name the troopers that come down, chat votes and the winner happens.
//   node test/ui6222.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  try { localStorage.setItem('ofs.notice', 'true'); } catch { /* fine */ }
  // Twitch's side of the conversation: answers the join for any channel but 'nosuchchannel', and says what the test tells it to
  window.__socks = [];
  window.__TwitchSocket = class { constructor(url) { this.url = url; this.sent = []; window.__socks.push(this); setTimeout(() => this.onopen && this.onopen(), 10); }
    send(s) { this.sent.push(s); const j = /^JOIN #(\w+)/.exec(s); if (j && j[1] !== 'nosuchchannel') setTimeout(() => this.onmessage && this.onmessage({ data: `:justinfan1!justinfan1@x JOIN #${j[1]}\r\n:tmi.twitch.tv 366 justinfan1 #${j[1]} :End of /NAMES list\r\n` }), 20); }
    close() { this.closed = true; if (this.onclose) this.onclose(); }
    say(user, text, shown) { this.onmessage({ data: `${shown ? `@badges=;display-name=${shown};mod=0 ` : ''}:${user}!${user}@${user}.tmi.twitch.tv PRIVMSG #chan :${text}\r\n` }); } };
});
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`file://${ROOT}/dist/orbital-fury.html?skipstart&seed=77&faction=bugs&biome=grass&tod=12`); await page.waitForTimeout(1500);
await page.click('#btn-play'); await page.waitForTimeout(300);
await ev(() => { document.getElementById('callsign').value = 'LIVE'; });
await page.click('#btn-lock'); await page.waitForTimeout(500); await page.click('#shop-go');
await page.waitForFunction(() => !document.getElementById('b-continue').disabled, null, { timeout: 30000 });
await page.click('#b-continue'); await page.waitForTimeout(1500);
await ev(() => { window.__game.mission.deployNow(); });
await page.waitForFunction(() => window.__game.mission.hdAlive.length > 0, null, { timeout: 60000 });
check('nothing of Twitch shows until a channel is connected', await ev(() => document.getElementById('tw-vote').classList.contains('hidden') && window.__socks.length === 0));

// ---- the streamer connects, from the menu
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#btn-settings-m'); await page.waitForTimeout(200);
await page.click('#btn-twitch-m'); await page.waitForTimeout(200);
const scr = await ev(() => ({ on: document.getElementById('s-twitch').classList.contains('on'), steps: [...document.querySelectorAll('.tw-steps li')].map((e) => e.textContent), msg: document.getElementById('tw-msg').textContent, btn: document.getElementById('tw-go').textContent }));
check('Settings has a TWITCH button that opens the Twitch screen, with the steps for the streamer', scr.on && scr.steps.length === 4 && scr.steps.every((s) => s.length > 20) && /CONNECT/.test(scr.steps[0]) && /!1/.test(scr.steps[2]), scr.steps[0]);
check('...not connected yet, and a CONNECT button', /Not connected/.test(scr.msg) && scr.btn === 'CONNECT', `${scr.msg} / ${scr.btn}`);
await page.fill('#tw-ch', 'not a channel!'); await page.click('#tw-go'); await page.waitForTimeout(100);
check('a name that cannot be a channel is refused', /does not look like a channel/.test(await ev(() => document.getElementById('tw-msg').textContent)) && await ev(() => window.__socks.length === 0));
await page.fill('#tw-ch', 'https://www.twitch.tv/Some_Streamer'); await page.click('#tw-go');
await page.waitForFunction(() => window.__game.twitch.state === 'on', null, { timeout: 5000 }).catch(() => {});
const con = await ev(() => ({ st: window.__game.twitch.state, ch: window.__game.twitch.channel, sent: window.__socks[0].sent, url: window.__socks[0].url, msg: document.getElementById('tw-msg').textContent, btn: document.getElementById('tw-go').textContent, saved: localStorage.getItem('ofs.twitch') }));
check('a channel link or name connects: joined as a guest, read-only', con.st === 'on' && con.ch === 'some_streamer' && con.url === 'wss://irc-ws.chat.twitch.tv:443' && con.sent.some((s) => /^NICK justinfan\d+$/.test(s)) && con.sent.includes('JOIN #some_streamer') && !con.sent.some((s) => /^PASS|PRIVMSG/.test(s)), con.sent.join(' | '));
check('...the screen says so, the button becomes DISCONNECT, and the channel is remembered', /Connected to some_streamer/.test(con.msg) && con.btn === 'DISCONNECT' && /some_streamer/.test(con.saved), con.msg);
await page.click('#tw-close'); await page.waitForTimeout(150);
check('closing it goes back to Settings', await ev(() => document.getElementById('s-settings').classList.contains('on')));
await page.click('#btn-settings-close'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// ---- names
await ev(() => { const s = window.__socks[0]; s.say('alice_w', 'hello', 'Alice_W'); s.say('bob99', 'lets go'); s.say('nightbot', 'follow the channel!'); s.say('carol', 'hi', 'Carol'); s.say('dave', 'o7'); s.say('erin', 'hi'); s.say('alice_w', 'again'); });
await page.waitForFunction(() => window.__game.mission.guests.length >= 5, null, { timeout: 5000 }).catch(() => {});
const q = await ev(() => ({ guests: window.__game.mission.guests.slice(), pool: window.__game.chatPlay.pool.slice() }));
check('everyone who chats goes into the pool once, bots left out, and names wait for the next troopers', q.pool.join() === 'ALICE_W,BOB99,CAROL,DAVE,ERIN' && q.guests.join() === q.pool.join(), q.pool.join());
const call = await ev(() => { const m = window.__game.mission, h = m.hdAlive[0]; m.seaf.cdUntil = -1; const r = m.callSeaf(h.x + 10, h.y + 6); return r && r.ok ? 'ok' : JSON.stringify(r); });
await page.waitForFunction(() => window.__game.mission.seafAlive.some((a) => a.guest), null, { timeout: 40000 }).catch(() => {});
const tr = await ev(() => window.__game.mission.seafAlive.filter((a) => a.guest).map((a) => a.name));
check('the troopers that come down carry chatters\' names, rank first', call === 'ok' && tr.length >= 3 && tr.every((n) => /^(SGT|SPC|DOC|CPL|PVT) (ALICE_W|BOB99|CAROL|DAVE|ERIN)$/.test(n)) && new Set(tr).size === tr.length, tr.join(', '));
const kia = await ev(() => { const m = window.__game.mission, a = m.seafAlive.find((x) => x.guest); const nm = a.name; m.killAlly(a, 'enemy'); return nm; });
await page.waitForTimeout(700);
const fell = await ev(() => [...document.querySelectorAll('#notices .nt')].map((e) => e.textContent).join(' | '));
check('when one of them falls the feed says so, by name', new RegExp(kia.split(' ')[1] + ' FROM CHAT IS DOWN').test(fell), fell.slice(-160));

// ---- the vote
const idle = await ev(() => ({ shown: !document.getElementById('tw-vote').classList.contains('hidden'), head: document.getElementById('tw-vh').textContent, t: document.getElementById('tw-t').textContent }));
check('between votes the top of the screen counts down to the next one', idle.shown && /NEXT VOTE/.test(idle.head) && /^\d:\d\d$/.test(idle.t), `${idle.head} ${idle.t}`);
await ev(() => { const g = window.__game; g.chatPlay.nextAt = g.mission.t; });
await page.waitForFunction(() => !!window.__game.chatPlay.vote, null, { timeout: 5000 });
await ev(() => { const s = window.__socks[0]; s.say('alice_w', '!3'); s.say('bob99', '!1'); s.say('carol', '1'); s.say('dave', '!1 please'); s.say('erin', '!9'); s.say('alice_w', '!1'); s.say('nightbot', '!3'); s.say('zed', 'what is this'); });
await page.waitForTimeout(500);
const vt = await ev(() => ({ head: document.getElementById('tw-vh').textContent, t: document.getElementById('tw-t').textContent, rows: [...document.querySelectorAll('#tw-rows .tw-o')].map((e) => e.textContent), foot: document.getElementById('tw-f').textContent, tally: window.__game.chatPlay.tally() }));
check('a vote shows its four choices with the command for each, the count and the time left', /CHAT VOTE/.test(vt.head) && vt.rows.length === 4 && /!1SEAF SQUAD/.test(vt.rows[0]) && /!4ENEMY REINFORCEMENTS/.test(vt.rows[3]) && /^0:\d\d$/.test(vt.t) && /number in chat/.test(vt.foot), vt.rows.join(' / '));
check('one vote each, the last one counts, a plain number counts, bots and other talk do not', vt.tally.join() === '4,0,0,0', vt.tally.join());
const s0 = await ev(() => { const g = window.__game, m = g.mission; window.__held = m.seafAlive.length + m.pelicans.length; g.chatPlay.vote.until = m.t; return m.pelicans.length; });
await page.waitForFunction(() => !window.__game.chatPlay.vote, null, { timeout: 5000 });
await page.waitForTimeout(600);
const won = await ev((p0) => ({ last: window.__game.chatPlay.last, pel: window.__game.mission.pelicans.length, feed: [...document.querySelectorAll('#notices .nt')].map((e) => e.textContent).join(' | '), head: document.getElementById('tw-vh').textContent }), s0);
check('the winner happens: chat sent a SEAF squad, and the feed says so', won.last && won.last.kind === 'troops' && won.last.ok === true && won.pel > s0 && /CHAT SENT: SEAF SQUAD/.test(won.feed), `${JSON.stringify(won.last)} pelicans ${s0} → ${won.pel}`);
check('...and the wait for the next vote starts again', /NEXT VOTE/.test(won.head));
// trouble
await ev(() => { const g = window.__game; g.chatPlay.nextAt = g.mission.t; });
await page.waitForFunction(() => !!window.__game.chatPlay.vote, null, { timeout: 5000 });
const e0 = await ev(() => { const s = window.__socks[0], g = window.__game; s.say('alice_w', '!3'); s.say('bob99', '!3'); const n = g.mission.enemies.length; g.chatPlay.vote.until = g.mission.t; return n; });
await page.waitForFunction(() => !window.__game.chatPlay.vote, null, { timeout: 5000 }); await page.waitForTimeout(400);
const bad = await ev(() => ({ last: window.__game.chatPlay.last, n: window.__game.mission.enemies.length }));
check('chat can send trouble too: an enemy patrol comes in', bad.last.kind === 'patrol' && bad.last.ok && bad.n > e0, `${e0} → ${bad.n} enemies`);
await ev(() => { const g = window.__game; g.chatPlay.nextAt = g.mission.t; });
await page.waitForFunction(() => !!window.__game.chatPlay.vote, null, { timeout: 5000 });
await ev(() => { const g = window.__game; g.chatPlay.vote.until = g.mission.t; });
await page.waitForFunction(() => !window.__game.chatPlay.vote, null, { timeout: 5000 }); await page.waitForTimeout(300);
check('a vote nobody voted in does nothing', await ev(() => window.__game.chatPlay.last.kind === null && /NOBODY VOTED/.test([...document.querySelectorAll('#notices .nt')].map((e) => e.textContent).join(' | '))));
// a pause holds the vote
await ev(() => { const g = window.__game; g.chatPlay.nextAt = g.mission.t; });
await page.waitForFunction(() => !!window.__game.chatPlay.vote, null, { timeout: 5000 });
await page.keyboard.press('Escape'); const l0 = await ev(() => window.__game.chatPlay.view(window.__game.mission).left); await page.waitForTimeout(1500);
const l1 = await ev(() => window.__game.chatPlay.view(window.__game.mission).left);
check('a pause holds the vote', Math.abs(l0 - l1) < 0.2, `${l0.toFixed(1)} s → ${l1.toFixed(1)} s`);

// ---- disconnect
await page.click('#btn-settings-m'); await page.waitForTimeout(150); await page.click('#btn-twitch-m'); await page.waitForTimeout(150); await page.click('#tw-go'); await page.waitForTimeout(200);
const off = await ev(() => ({ st: window.__game.twitch.state, closed: window.__socks[0].closed, msg: document.getElementById('tw-msg').textContent, saved: JSON.parse(localStorage.getItem('ofs.twitch')).on }));
check('DISCONNECT closes the connection and is remembered', off.st === 'off' && off.closed === true && /Not connected/.test(off.msg) && off.saved === false);
await page.fill('#tw-ch', 'nosuchchannel'); await page.click('#tw-go');
await page.waitForFunction(() => window.__game.twitch.state === 'error', null, { timeout: 15000 }).catch(() => {});
check('a channel that never answers is given up on, and the screen says to check the name', await ev(() => window.__game.twitch.state === 'error' && /Check the channel name/.test(document.getElementById('tw-msg').textContent)));
await page.click('#tw-close'); await page.click('#btn-settings-close'); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
check('with no channel connected the readout is gone and no names wait', await ev(() => document.getElementById('tw-vote').classList.contains('hidden') && window.__game.mission.guests.length === 0));
check('no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
