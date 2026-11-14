// (0.50.1) Desktop key bindings. Every action has its own key (the primary, which the player can change in CONTROLS → CHANGE
// KEYS) and maybe a fixed second one (the arrows for panning, Backspace for disband, numpad zoom). A second key gives way when it is
// some action's own key. Giving an action a key another action has swaps the two, so no key ever does two things. ESC, the
// modifier keys and the Shift / Alt / Ctrl combinations (squads on Shift+digits, Ctrl+A) are fixed. Saved on this browser.
const STORE = 'ofs.keys';

// [action, own key, second keys], grouped as the CHANGE KEYS list shows them
export const GROUPS = [
  ['cam', [['panUp', 'KeyW', ['ArrowUp']], ['panLeft', 'KeyA', ['ArrowLeft']], ['panDown', 'KeyS', ['ArrowDown']], ['panRight', 'KeyD', ['ArrowRight']],
    ['zoomIn', 'Equal', ['NumpadAdd']], ['zoomOut', 'Minus', ['NumpadSubtract']], ['follow', 'KeyF', []], ['map', 'Tab', ['KeyM', 'KeyL']]]],
  ['weap', [['w1', 'Digit1', []], ['w2', 'Digit2', []], ['w3', 'Digit3', []], ['w4', 'Digit4', []], ['w5', 'Digit5', []], ['w6', 'Digit6', []],
    ['w7', 'Digit7', []], ['w8', 'Digit8', []], ['w9', 'Digit9', []], ['cyclePrev', 'KeyQ', []], ['cycleNext', 'KeyE', []], ['eagleRearm', 'Digit0', []]]],
  ['seaf', [['seaf', 'KeyG', []], ['auto', 'KeyX', []], ['move', 'KeyV', []], ['protect', 'KeyZ', []], ['attack', 'KeyN', []], ['escort', 'KeyC', []],
    ['allSquads', 'Backquote', []], ['draw', 'KeyR', []], ['disband', 'Delete', ['Backspace']]]],
  ['panel', [['build', 'KeyB', []], ['armory', 'KeyY', []], ['supply', 'KeyU', []], ['look', 'KeyJ', []], ['timeYes', 'KeyK', []], ['info', 'KeyI', []],
    ['radio', 'KeyO', []], ['thermal', 'KeyT', []], ['relief', 'KeyH', []], ['hideUi', 'F2', []], ['debug', 'F3', []]]],
  ['time', [['pause', 'Space', []], ['softPause', 'KeyP', []], ['speed', 'Comma', []], ['deploy', 'Enter', ['NumpadEnter']]]],
];
const DEF = {}, ALT = {};
for (const [, list] of GROUPS) for (const [a, k, alt] of list) { DEF[a] = k; ALT[a] = alt; }
export const ACTIONS = Object.keys(DEF);
// keys that can't be given to anything
const FIXED = new Set(['Escape', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'ContextMenu', 'OSLeft', 'OSRight']);
export const canBind = (code) => !!code && !FIXED.has(code);

let own = { ...DEF };
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && typeof s === 'object') for (const a of ACTIONS) if (typeof s[a] === 'string' && canBind(s[a])) own[a] = s[a];
  } catch { /* ignore */ }
  // a saved list that somehow gave one key to two actions: the later one goes back to its default (or none)
  const used = new Set();
  for (const a of ACTIONS) {
    if (own[a] && used.has(own[a])) own[a] = used.has(DEF[a]) ? '' : DEF[a];
    if (own[a]) used.add(own[a]);
  }
}
function save() {
  try {
    const diff = {}; for (const a of ACTIONS) if (own[a] !== DEF[a]) diff[a] = own[a];
    if (Object.keys(diff).length) localStorage.setItem(STORE, JSON.stringify(diff)); else localStorage.removeItem(STORE);
  } catch { /* ignore */ }
}
load();
let map = null;
function build() {
  map = new Map();
  for (const a of ACTIONS) if (own[a]) map.set(own[a], a);
  for (const a of ACTIONS) for (const k of ALT[a]) if (!map.has(k)) map.set(k, a);      // second keys give way to anyone's own key
}
build();

export const keyOf = (a) => own[a] || '';
export const isDefault = () => ACTIONS.every((a) => own[a] === DEF[a]);
export const defaultOf = (a) => DEF[a];
// the action a key does now (or null)
export const actionOf = (code) => (map.get(code) || null);
// every key that does this action now (its own and its second keys)
export function codesOf(a) { const out = []; for (const [k, b] of map) if (b === a) out.push(k); return out; }
// Give an action a key. Another action that had it gets this action's old key (a swap). Returns { ok, swapped: action | null }.
export function setKey(a, code) {
  if (!(a in DEF) || !canBind(code)) return { ok: false, swapped: null };
  if (own[a] === code) return { ok: true, swapped: null };
  const other = ACTIONS.find((b) => b !== a && own[b] === code) || null;
  if (other) own[other] = own[a];
  own[a] = code;
  build(); save(); notify();
  return { ok: true, swapped: other };
}
export function resetKeys() { own = { ...DEF }; build(); save(); notify(); }

const subs = new Set();
export function onKeysChange(f) { subs.add(f); return () => subs.delete(f); }
function notify() { for (const f of subs) { try { f(); } catch { /* ignore */ } } }

// How a key is written on a button: W, 1, SPACE, ↑, NUM +
const NAMES = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Tab: 'TAB', Backspace: 'BKSP', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END',
  PageUp: 'PG UP', PageDown: 'PG DN', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\',
  NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -', NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
  m = /^Digit([0-9])$/.exec(code); if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code); if (m) return 'NUM ' + m[1];
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}
export const label = (a) => keyLabel(keyOf(a));
