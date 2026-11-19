// (0.62.22) Twitch chat plays along (the connection is js/twitch.js; what the winner of a vote does is sim/chat.js).
//   NAMES  Everyone who chats goes into a pool. SEAF troopers coming down take the next names from it, in the order people
//          spoke, and nobody gets a second trooper while their first is alive.
//   VOTES  Every C.twitch.voteEvery seconds of mission time a vote opens for C.twitch.voteSec seconds. Chat types !1 to !4
//          (a plain 1 to 4 counts too); the last one from each person is their vote. The most votes wins; a tie is drawn; no
//          votes, nothing happens.
// No timers of its own: tick() is called from the game loop and goes by the mission's clock, so a pause pauses the vote too.
import { CONFIG as C } from './config.js';
import { chatEffect } from './sim/chat.js';

export function cleanName(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, C.twitch.nameMax);
}

export class ChatPlay {
  constructor() { this.pool = []; this.seen = new Set(); this.names = true; this.votes = true; this.vote = null; this.nextAt = 0; this.m = null; this.last = null; this.ptr = 0; }
  reset() { this.pool = []; this.seen.clear(); this.vote = null; this.ptr = 0; }
  // a chat message: user (login), text, name (as shown in chat)
  onChat(user, text, name) {
    const login = String(user || '').toLowerCase();
    if (!login || C.twitch.ignore.includes(login)) return;
    const nm = cleanName(name) || cleanName(login);
    if (!nm) return;
    if (!this.seen.has(nm)) { this.seen.add(nm); this.pool.push(nm); if (this.pool.length > C.twitch.pool) this.seen.delete(this.pool.shift()); }
    if (this.vote) {
      const v = /^\s*!?([1-9])\b/.exec(String(text || ''));
      if (v && +v[1] <= this.vote.options.length) this.vote.by.set(login, +v[1] - 1);
    }
  }
  // keep a few names waiting in the mission for the next troopers down
  topUp(m, want = 12) {
    if (!this.names) { m.guests.length = 0; return; }
    if (m.guests.length >= want || !this.pool.length) return;
    const busy = new Set(m.guests);
    for (const a of m.seafAlive) if (a.guest) busy.add(a.guest);
    const N = this.pool.length; let used = 0;
    for (let k = 0; k < N && m.guests.length < want; k++) { const nm = this.pool[(this.ptr + k) % N]; used = k + 1; if (!busy.has(nm)) { m.guests.push(nm); busy.add(nm); } }
    this.ptr = (this.ptr + used) % N;
  }
  tally() {
    if (!this.vote) return [];
    const n = this.vote.options.map(() => 0);
    for (const i of this.vote.by.values()) n[i]++;
    return n;
  }
  // live: connected, votes on, and the mission is being played. Returns a result when a vote has just closed:
  // { kind, votes, total, ok } (kind null: nobody voted)
  tick(m, live) {
    if (this.m !== m) { this.m = m; this.vote = null; this.nextAt = m.t + C.twitch.firstVote; }
    if (!live || !this.votes || m.over) { if (this.vote && (m.over || !this.votes)) this.vote = null; return null; }
    if (!this.vote) {
      if (m.t >= this.nextAt && m.hdAlive.length) this.vote = { options: C.twitch.options.slice(), until: m.t + C.twitch.voteSec, by: new Map() };
      return null;
    }
    if (m.t < this.vote.until) return null;
    const n = this.tally(), total = n.reduce((a, b) => a + b, 0), top = Math.max(...n);
    const opts = this.vote.options; this.vote = null; this.nextAt = m.t + C.twitch.voteEvery;
    if (!total) return (this.last = { kind: null, votes: 0, total: 0, ok: false });
    const best = opts.filter((_, i) => n[i] === top), kind = best[Math.floor(Math.random() * best.length)];
    return (this.last = { kind, votes: top, total, ok: !!chatEffect(m, kind) });
  }
  // for the readout: { open, left (seconds), options: [{ kind, n }], total } or { open: false, next (seconds) }
  view(m) {
    if (this.vote) { const n = this.tally(); return { open: true, left: Math.max(0, this.vote.until - m.t), options: this.vote.options.map((kind, i) => ({ kind, n: n[i] })), total: n.reduce((a, b) => a + b, 0) }; }
    return { open: false, next: Math.max(0, this.nextAt - m.t) };
  }
}
