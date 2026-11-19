// 0.62.22: Twitch chat, without a browser: reading chat lines, the pool of names, the vote, and what the winner does.
//   node test/r6222.mjs
import { Mission } from '../js/sim/mission.js';
import { CONFIG as C } from '../js/config.js';
import { channelName, parseLine } from '../js/twitch.js';
import { ChatPlay, cleanName } from '../js/chatplay.js';
import { chatEffect, CHAT_HELP } from '../js/sim/chat.js';
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== undefined ? `  (${info})` : ''}`); };
const dt = 1 / C.world.tickHz;
check('a channel can be given as a name, with # or @, or as a link', channelName('Some_Name') === 'some_name' && channelName('#abc') === 'abc' && channelName('@abc') === 'abc' && channelName('https://www.twitch.tv/Abc_1?x=1') === 'abc_1' && channelName('twitch.tv/abc/videos') === 'abc');
check('...and what cannot be a channel is refused', channelName('a b') === '' && channelName('ab') === '' && channelName('') === '' && channelName('x'.repeat(26)) === '' && channelName('bad!name') === '');
const p1 = parseLine('@badge-info=;display-name=Alice_W;mod=0 :alice_w!alice_w@alice_w.tmi.twitch.tv PRIVMSG #chan :!2 go go'), p2 = parseLine(':bob!bob@bob.tmi.twitch.tv PRIVMSG #chan :hello : there');
check('a chat line gives who said it, their shown name and the words', p1.user === 'alice_w' && p1.name === 'Alice_W' && p1.text === '!2 go go' && p2.user === 'bob' && p2.name === 'bob' && p2.text === 'hello : there');
check('...and anything else from the server is not chat', parseLine('PING :tmi.twitch.tv') === null && parseLine(':tmi.twitch.tv 366 x #chan :End of /NAMES list') === null && parseLine(':x!x@x JOIN #chan') === null);
check('names are cut to plain capitals, digits and _', cleanName('Some_Guy 99!') === 'SOME_GUY99' && cleanName('ほげ') === '' && cleanName('x'.repeat(40)).length === C.twitch.nameMax);
{
  const cp = new ChatPlay();
  for (const u of ['amy', 'ben', 'nightbot', 'cat', 'amy', 'ほげ']) cp.onChat(u, 'hi', u);
  check('the pool holds each chatter once, in the order they spoke; bots and names with no letters are left out', cp.pool.join() === 'AMY,BEN,CAT', cp.pool.join());
  const m = new Mission({ seed: 7, faction: 'bugs', biome: 'grass', difficulty: 3, missionN: 1, events: false });
  m.deployNow(); for (let i = 0; i < 30 * 15 && !m.hdAlive.length; i++) m.step(dt);
  cp.topUp(m);
  check('names wait in the mission for the next troopers', m.guests.join() === 'AMY,BEN,CAT');
  const n0 = m.seafAlive.length; m.seaf.cdUntil = -1; const h = m.hdAlive[0]; m.callSeaf(h.x + 10, h.y + 6);
  for (let i = 0; i < 30 * 30 && m.seafAlive.filter((a) => a.guest).length < 3; i++) { m.enemies.length = 0; m.step(dt); }
  const g = m.seafAlive.filter((a) => a.guest);
  check('the next troopers down take them, keeping their rank', g.length === 3 && g.map((a) => a.guest).sort().join() === 'AMY,BEN,CAT' && g.every((a) => /^(SGT|SPC|DOC|CPL|PVT) /.test(a.name)), m.seafAlive.slice(n0).map((a) => a.name).join(', '));
  cp.topUp(m); check('nobody gets a second trooper while their first is alive', m.guests.length === 0, m.guests.join());
  const dead = g[0]; m.emitOn = true; m.events.length = 0; m.killAlly(dead, 'enemy');
    const evDown = m.events.some((e) => e.type === 'guest_down' && e.name === dead.guest); m.enemies.length = 0; m.step(dt);
  check('a chatter\'s trooper falling is its own event, by name', evDown);
  cp.topUp(m); check('...and then they can come down again', m.guests.join() === dead.guest, m.guests.join());
  // the vote
  cp.tick(m, true); check('no vote in the first moments of a mission', !cp.vote && cp.view(m).next > 0);
  cp.nextAt = m.t; cp.tick(m, true);
  check('then a vote opens, with the four choices', !!cp.vote && cp.view(m).open && cp.view(m).options.map((o) => o.kind).join() === C.twitch.options.join());
  cp.onChat('amy', '!2'); cp.onChat('ben', '2'); cp.onChat('cat', '!1'); cp.onChat('amy', '!2 again'); cp.onChat('dan', '!7'); cp.onChat('nightbot', '!1'); cp.onChat('eve', 'what?');
  check('one vote each (the last), a plain number counts, numbers past the choices and bots do not', cp.tally().join() === '1,2,0,0', cp.tally().join());
  check('it stays open until its time is up', cp.tick(m, true) === null && !!cp.vote);
  cp.vote.until = m.t; const r = cp.tick(m, true);
  check('the most votes wins and happens', r && r.kind === 'supply' && r.votes === 2 && r.total === 3 && r.ok === true && !cp.vote, JSON.stringify(r));
  check('...and the next one is voteEvery seconds on', Math.abs(cp.nextAt - m.t - C.twitch.voteEvery) < 0.01);
  cp.nextAt = m.t; cp.tick(m, true); cp.vote.until = m.t; const none = cp.tick(m, true);
  check('nobody voting does nothing', none && none.kind === null && none.ok === false);
  cp.nextAt = m.t; cp.votes = false; check('with votes switched off none opens', cp.tick(m, true) === null && !cp.vote); cp.votes = true;
  cp.names = false; m.guests.push('X'); cp.topUp(m); check('with names switched off none wait', m.guests.length === 0);
}
for (const fac of ['bugs', 'bots', 'squids']) {
  const m = new Mission({ seed: 21, faction: fac, biome: 'grass', difficulty: 4, missionN: 2, events: false });
  check(`${fac}: nothing chat sends can happen before anyone is down`, C.twitch.options.every((k) => chatEffect(m, k) === false));
  m.deployNow(); for (let i = 0; i < 30 * 18; i++) m.step(dt);
  const s = m.supply, cd = s.cdUntil; for (const a of m.hdAlive) { a.stims = 0; a.gren = 0; }
  const okS = chatEffect(m, 'supply');
  check(`${fac}: a supply pod from chat restocks the squad and costs the player's own pod nothing`, okS && m.hdAlive.every((a) => a.stims > 0 && a.gren > 0) && s.cdUntil === cd && s.state === 'idle');
  const p0 = m.pelicans.length, okT = chatEffect(m, 'troops');
  check(`${fac}: a SEAF squad from chat comes down in a Pelican of its own, ${C.twitch.troops} troopers`, okT && m.pelicans.length === p0 + 1 && m.pelicans[m.pelicans.length - 1].roles.length === C.twitch.troops);
  const e0 = m.enemies.length, okP = chatEffect(m, 'patrol');
  check(`${fac}: an enemy patrol from chat comes in from the edge, hunting the squad`, okP && m.enemies.length > e0, `${e0} → ${m.enemies.length}`);
  const d0 = m.stats.reinfCalls || 0, okF = chatEffect(m, 'flare');
  check(`${fac}: enemy reinforcements from chat are called on the squad`, okF === true);
  check(`${fac}: two of the four help and two hurt`, C.twitch.options.filter((k) => CHAT_HELP[k]).length === 2);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
