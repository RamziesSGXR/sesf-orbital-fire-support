// (0.62.22) Reading a Twitch channel's chat. Read-only and anonymous: no login, no key, nothing sent to chat. The browser opens
// one WebSocket to Twitch's chat server, joins the channel as a guest and listens. Lost connections are retried.
//   const tw = new TwitchChat((user, text) => …, (state, channel) => …);   tw.connect('channel');   tw.disconnect();
// state: 'off' | 'connecting' | 'on' | 'error' (never got in: wrong name, or no way through to Twitch) | 'bad' (not a channel name)
const URL_ = 'wss://irc-ws.chat.twitch.tv:443';

// 'https://www.twitch.tv/Some_Name', '#some_name' or 'Some_Name' → 'some_name'; '' if it cannot be a channel
export function channelName(s) {
  const m = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^(www\.|m\.)?twitch\.tv\//, '').replace(/^[#@]/, '').replace(/[/?].*$/, '');
  return /^[a-z0-9_]{3,25}$/.test(m) ? m : '';
}
// one line from the server → { user, text } for a chat message, else null
export function parseLine(line) {
  const m = /^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #\w+ :(.*)$/.exec(line);
  if (!m) return null;
  const dn = m[1] && /(?:^|;)display-name=([^;]*)/.exec(m[1]);
  return { user: m[2], name: dn && dn[1] ? dn[1] : m[2], text: m[3] };
}

export class TwitchChat {
  constructor(onMsg, onState) { this.onMsg = onMsg; this.onState = onState; this.state = 'off'; this.channel = ''; this.ws = null; this.want = false; this.tries = 0; this.joined = false; this.timer = 0; }
  _set(s) { if (s !== this.state) { this.state = s; if (this.onState) this.onState(s, this.channel); } }
  connect(raw) {
    const ch = channelName(raw);
    this.disconnect();
    if (!ch) { this.channel = ''; this._set('bad'); return false; }
    this.channel = ch; this.want = true; this.tries = 0; this.joined = false;
    this._open();
    return true;
  }
  disconnect() {
    this.want = false; clearTimeout(this.timer);
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch { /* gone */ } this.ws = null; }
    this._set('off');
  }
  _open() {
    const Sock = (typeof window !== 'undefined' && window.__TwitchSocket) || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!Sock) { this._set('error'); return; }
    this._set('connecting');
    let ws;
    try { ws = new Sock(URL_); } catch { this._retry(); return; }
    this.ws = ws;
    ws.onopen = () => { ws.send('CAP REQ :twitch.tv/tags'); ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`); ws.send(`JOIN #${this.channel}`); };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        if (!this.joined && (/ 366 /.test(line) || / JOIN #/.test(line))) { this.joined = true; this.tries = 0; this._set('on'); continue; }
        const msg = parseLine(line);
        if (msg && this.onMsg) this.onMsg(msg.user, msg.text, msg.name);
      }
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this._retry(); } };
    // a channel name Twitch does not know never answers the join: give up after a while and say so
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.want && !this.joined && this.ws === ws) { try { ws.onclose = null; ws.close(); } catch { /* gone */ } this.ws = null; this.want = false; this._set('error'); } }, 9000);
  }
  _retry() {
    if (!this.want) return;
    this.tries++;
    if (!this.joined && this.tries >= 3) { this.want = false; this._set('error'); return; }
    this._set('connecting');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.want) this._open(); }, Math.min(30000, 1500 * 2 ** Math.min(5, this.tries)));
  }
}
