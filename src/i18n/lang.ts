import { AR } from './ar';

export type Lang = 'en' | 'ar';
export const getLang = (): Lang => { try { return localStorage.getItem('app_lang') === 'ar' ? 'ar' : 'en'; } catch { return 'en'; } };
/** the page reloads so every screen starts clean in the chosen language */
export const setLang = (l: Lang) => { try { localStorage.setItem('app_lang', l); } catch { /* ignore */ } window.location.reload(); };

// the dictionary is looked up by the text as shown, also without a trailing colon, star, dots or counters
const lookup = (raw: string): string | null => {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (AR[t]) return AR[t];
  const m = /^(.*?)\s*([:*…]|\.\.\.)*$/.exec(t);
  const core = m ? m[1].trim() : t;
  if (core !== t && AR[core]) return AR[core] + t.slice(core.length);
  return null;
};
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'OPTION_DISABLED']);
const done = new WeakSet<Node>();
const ATTRS = ['placeholder', 'title', 'aria-label'];

function text(n: Node) {
  const p = n.parentElement;
  if (!p || SKIP.has(p.tagName) || p.closest('[translate="no"]')) return;
  const raw = n.nodeValue || '';
  const ar = lookup(raw);
  if (ar) { const lead = /^\s*/.exec(raw)![0], tail = /\s*$/.exec(raw)![0]; const next = lead + ar + tail; if (next !== raw) n.nodeValue = next; }
}
function walk(root: Node) {
  if (root.nodeType === 3) { text(root); return; }
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (SKIP.has(el.tagName) && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
  if (el.closest('[translate="no"]')) return;
  for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const ar = lookup(v); if (ar && ar !== v) el.setAttribute(a, ar); } }
  const opts = el.tagName === 'OPTION' ? [el] : [];
  void opts;
  for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
}

/** call once at start: sets the direction and, for Arabic, translates the page now and whenever it changes */
export function initLang() {
  const lang = getLang();
  const h = document.documentElement;
  h.lang = lang; h.dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (lang !== 'ar') return;
  h.classList.add('lang-ar');
  let queued = false; const pending = new Set<Node>();
  const flush = () => { queued = false; const list = [...pending]; pending.clear(); obs.disconnect(); try { for (const n of list) if (n.isConnected) walk(n); } finally { obs.observe(document.body, cfg); } };
  const cfg: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  const obs = new MutationObserver((ms) => {
    for (const m of ms) { if (m.type === 'childList') m.addedNodes.forEach((n) => pending.add(n)); else pending.add(m.target); }
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  });
  const start = () => { walk(document.body); obs.observe(document.body, cfg); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
