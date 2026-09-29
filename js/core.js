'use strict';

// Shared namespace. Every script in the game hangs its pieces off AG so the
// files can load as plain <script> tags (which also works from file://).
const AG = (window.AG = {});

// ---------------------------------------------------------------------------
// DOM helpers

AG.h = function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  setProps(el, props);
  appendKids(el, kids);
  return el;
};

AG.s = function s(tag, props, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  setProps(el, props);
  appendKids(el, kids);
  return el;
};

function setProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function appendKids(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
}

AG.esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Storage (per-browser conveniences: progress, saved code)

AG.store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('obml:' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('obml:' + key, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem('obml:' + key);
    } catch {}
  },
};

// ---------------------------------------------------------------------------
// Chapters and progress

AG.chapters = [];
AG.chapter = def => AG.chapters.push(def);

AG.progress = {
  passed: id => !!AG.store.get('pass:' + id, false),
  pass(id) {
    if (this.passed(id)) return;
    AG.store.set('pass:' + id, true);
    document.dispatchEvent(new CustomEvent('ag:progress', { detail: id }));
  },
  chapterState(ch) {
    const done = ch.checkpoints.filter(c => this.passed(c.id)).length;
    if (done === ch.checkpoints.length) return 'done';
    return done > 0 ? 'started' : 'fresh';
  },
  reset() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('obml:'))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  },
};

// Widgets that run timers or workers register a cleanup so leaving a page
// stops them.
AG._cleanups = [];
AG.onLeave = fn => AG._cleanups.push(fn);
AG.leave = () => {
  const fns = AG._cleanups.splice(0);
  fns.forEach(fn => {
    try {
      fn();
    } catch {}
  });
};

// A promise-based pause that stops mattering once the page is left.
AG.wait = ms => new Promise(r => setTimeout(r, AG.reducedMotion() ? Math.min(ms, 60) : ms));
AG.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Code highlighting. `await` gets its own colour everywhere in the game,
// because every await is a place where other ants get a turn.

const TOKEN_RE =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|\b(await)\b|\b(async|function|return|const|let|var|if|else|for|while|of|in|new|class|this|true|false|null|undefined|break|continue|throw|try|catch|finally|typeof|def|with|import|from|not|and|or|None|True|False|nonlocal|pass|lambda|elif)\b|\b(\d+(?:\.\d+)?)\b/g;

AG.highlight = function highlight(src, { python = false } = {}) {
  let out = '';
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    // '#' starts a comment only in Python snippets.
    if (m[1] && m[1][0] === '#' && !python) {
      out += AG.esc(src.slice(last, m.index + 1));
      last = m.index + 1;
      TOKEN_RE.lastIndex = last;
      continue;
    }
    out += AG.esc(src.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'aw' : m[4] ? 'k' : 'n';
    out += `<span class="t-${cls}">${AG.esc(m[0])}</span>`;
    last = TOKEN_RE.lastIndex;
  }
  return out + AG.esc(src.slice(last));
};

// Returns HTML for a highlighted code block, for use inside prose strings.
AG.code = (src, opts = {}) =>
  `<pre class="code${opts.python ? ' py' : ''}"${opts.label ? ` data-label="${AG.esc(opts.label)}"` : ''}><code>${AG.highlight(
    src.replace(/^\n/, '').replace(/\s+$/, ''),
    opts
  )}</code></pre>`;

// A block of lesson text.
AG.prose = html => AG.h('div', { class: 'prose', html });

// Ant roster: the same names and colours in every widget.
AG.ANTS = [
  { name: 'Ada', color: '#2a1a12' },
  { name: 'Bo', color: '#b5451b' },
  { name: 'Cy', color: '#6b4e9b' },
  { name: 'Di', color: '#1f7a6b' },
  { name: 'Eli', color: '#b07d12' },
  { name: 'Fen', color: '#8b2f4f' },
];

// Shuffle with a seed so "random" demos are repeatable.
AG.rng = function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// A framed widget: the green plastic ant-farm frame with a name plate.
AG.frame = (title, ...kids) =>
  AG.h('section', { class: 'frame' }, title ? AG.h('div', { class: 'plate', text: title }) : null, ...kids);
