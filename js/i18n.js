// Every piece of text the game shows lives in a language table (js/lang/en.js, fr.js, es.js), keyed by name. English is the
// reference: a key missing from another table falls back to English, and a key missing everywhere shows as itself (the i18n test
// catches both). t('key', { n: 3 }) fills {n} in the string; a table entry can also be a function of those values, or a list
// (radio and chatter lines).
//
// The language is a setting (Settings > Language, and the title screen). ?lang=fr|es|en overrides it for one visit.
// Some things are never translated: operation names, callsigns, ship names, and the community score block (always English,
// so posts in the channel read the same whoever wrote them).
import EN from './lang/en.js';
import FR from './lang/fr.js';
import ES from './lang/es.js';

export const LANGS = { en: { name: 'English', t: EN }, fr: { name: 'Français', t: FR }, es: { name: 'Español', t: ES } };
let cur = 'en', T = EN;

export function setLang(l) {
  cur = LANGS[l] ? l : 'en'; T = LANGS[cur].t;
  if (typeof document !== 'undefined') document.documentElement.lang = cur;
  return cur;
}
export const getLang = () => cur;

function fmt(s, v) {
  if (typeof s === 'function') return s(v || {});
  if (typeof s !== 'string' || !v) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined && v[k] !== null ? v[k] : m));
}
// The string for key in the current language.
export function t(key, v) {
  let s = T[key];
  if (s === undefined) s = EN[key];
  if (s === undefined) return key;
  return fmt(s, v);
}
// The same, always in English (the score block).
export function tEn(key, v) { const s = EN[key]; return s === undefined ? key : fmt(s, v); }
// A list (radio variants, chatter lines, tips).
export function tl(key) {
  const s = T[key] !== undefined ? T[key] : EN[key];
  return Array.isArray(s) ? s : [];
}
export const has = (key) => T[key] !== undefined || EN[key] !== undefined;

// Fill the static page: data-t (text), data-th (markup from the table, never from players), data-ta (aria-label),
// data-tt (title), data-tp (placeholder).
export function applyDom(root = document) {
  for (const e of root.querySelectorAll('[data-t]')) e.textContent = t(e.dataset.t);
  for (const e of root.querySelectorAll('[data-th]')) e.innerHTML = t(e.dataset.th);
  for (const e of root.querySelectorAll('[data-ta]')) e.setAttribute('aria-label', t(e.dataset.ta));
  for (const e of root.querySelectorAll('[data-tt]')) e.title = t(e.dataset.tt);
  for (const e of root.querySelectorAll('[data-tp]')) e.placeholder = t(e.dataset.tp);
}

// The language to start in: ?lang=, else the saved setting, else English.
export function startLang(saved) {
  let q = '';
  try { q = new URLSearchParams(location.search).get('lang') || ''; } catch { q = ''; }
  return LANGS[q] ? q : LANGS[saved] ? saved : 'en';
}
