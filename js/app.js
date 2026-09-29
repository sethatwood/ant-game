'use strict';

// Routing and page shells: the farm (home), chapters, and the glossary.

(function () {
  const { h, s } = AG;
  const app = document.getElementById('app');
  const GAME = 'concurrANTcy';

  function nextChapter() {
    return AG.chapters.find(c => AG.progress.chapterState(c) !== 'done');
  }

  // -------------------------------------------------------------------------
  // The farm map

  function farmMap() {
    const n = AG.chapters.length;
    const GAP = 106;
    const W = 520;
    const H = 170 + (n - 1) * GAP + 90;
    const pts = AG.chapters.map((c, i) => ({ x: i % 2 ? 372 : 148, y: 176 + i * GAP }));
    const svg = s('svg', { class: 'map', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Chapters, drawn as chambers of an ant farm' });

    const strata = s('g', { class: 'strata' });
    for (let y = 120, k = 0; y < H; y += 150, k++) {
      strata.append(s('path', { class: 'stratum s' + (k % 3), d: `M0 ${y} C 130 ${y - 24}, 260 ${y + 26}, ${W} ${y - 6} L ${W} ${y + 150} L 0 ${y + 150} Z` }));
    }
    svg.append(s('rect', { class: 'sky', x: 0, y: 0, width: W, height: 104 }), strata);
    svg.append(s('path', { class: 'mound', d: 'M170 104 Q 260 34 350 104 Z' }), s('ellipse', { class: 'hole', cx: 260, cy: 100, rx: 15, ry: 6 }));
    svg.append(s('path', { class: 'grass', d: `M0 104 ${(() => { let d = ''; for (let x = 0; x <= W; x += 10) d += `L${x} ${104 - (x % 20 ? 5 : 10)} L${x + 5} 104 `; return d; })()}` }));

    let d = 'M260 102';
    let prev = { x: 260, y: 102 };
    for (const p of pts) {
      d += ` C ${prev.x} ${prev.y + 56}, ${p.x} ${p.y - 60}, ${p.x} ${p.y}`;
      prev = p;
    }
    svg.append(s('path', { class: 'map-tunnel-shadow', d }), s('path', { class: 'map-tunnel', d }));

    const upNext = nextChapter();
    AG.chapters.forEach((c, i) => {
      const p = pts[i];
      const state = AG.progress.chapterState(c);
      const right = i % 2 === 0;
      const a = s('a', { href: `#/c/${c.id}`, class: `map-chamber ${state}${upNext === c ? ' next' : ''}`, 'aria-label': `Chapter ${i + 1}: ${c.title} (${state === 'done' ? 'finished' : state === 'started' ? 'in progress' : 'not started'})` });
      a.append(
        s('ellipse', { class: 'ring', cx: p.x, cy: p.y, rx: 86, ry: 44 }),
        s('ellipse', { class: 'room', cx: p.x, cy: p.y, rx: 76, ry: 36 }),
        s('text', { class: 'num', x: p.x, y: p.y + 10, 'text-anchor': 'middle', text: String(i + 1) })
      );
      if (state === 'done') {
        [[-44, 12, 0], [40, 14, 1], [-30, -16, 2]].forEach(([dx, dy, k]) => {
          const g = AG.antGlyph(AG.ANTS[(i + k) % 6].color);
          a.append(s('g', { transform: `translate(${p.x + dx} ${p.y + dy}) scale(1.1)${k === 1 ? ' scale(-1 1)' : ''}` }, g));
        });
      }
      const tx = right ? p.x + 96 : p.x - 96;
      const anchor = right ? 'start' : 'end';
      const shortLines = wrapWords(c.short, 26);
      const top = p.y - 6 - (shortLines.length - 1) * 8;
      a.append(
        s('text', { class: 'ctitle', x: tx, y: top, 'text-anchor': anchor, text: c.title }),
        s('text', { class: 'cshort', x: tx, y: top + 21, 'text-anchor': anchor },
          shortLines.map((ln, k) => s('tspan', { x: tx, dy: k ? 17 : 0, text: ln }))
        )
      );
      svg.append(a);
    });
    return svg;
  }

  function wrapWords(text, max) {
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if (cur && (cur + ' ' + w).length > max) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function home() {
    document.title = GAME;
    const up = nextChapter();
    const doneCount = AG.chapters.filter(c => AG.progress.chapterState(c) === 'done').length;
    const cta = up
      ? h('a', { class: 'btn big', href: `#/c/${up.id}`, text: doneCount === 0 && AG.progress.chapterState(up) === 'fresh' ? 'Start digging: chapter 1' : `Continue: chapter ${AG.chapters.indexOf(up) + 1}, ${up.title}` })
      : h('a', { class: 'btn big', href: '#/c/' + AG.chapters[AG.chapters.length - 1].id, text: 'Every chamber is dug. Revisit the last one' });
    const resetSlot = h('div', { class: 'confirm-slot' });
    const resetBtn = h('button', {
      class: 'linkish',
      text: 'Reset my progress',
      onclick: () =>
        resetSlot.replaceChildren(
          h('div', { class: 'confirm' },
            h('span', { text: 'Forget every passed checkpoint and all saved code?' }),
            h('button', { class: 'btn small danger', text: 'Reset everything', onclick: () => { AG.progress.reset(); render(); } }),
            h('button', { class: 'btn ghost small', text: 'Keep it', onclick: () => resetSlot.replaceChildren() })
          )
        ),
    });
    return h('main', { class: 'home' },
      h('div', { class: 'home-text' },
        h('h1', { class: 'title' }, h('span', { text: 'One brain,' }), h('span', { text: 'many legs' })),
        h('p', { class: 'lede', text: 'A game about concurrency in JavaScript, played with an ant colony.' }),
        AG.prose(`
          <p>Your colony needs a map of every chamber in its nest. You have a handful of worker ants and one brain that they all share. By the last chamber of this farm you will have written a concurrent web crawler, the kind asked about in real interviews, and you will know why each line of it is there.</p>
          <p>The game starts from nothing: no knowledge of threads, promises or the event loop is assumed. Each chapter explains one idea, lets you poke at it until it clicks, and then asks you to write a little code that the game tests for you.</p>
        `),
        h('div', { class: 'row' }, cta),
        h('p', { class: 'progress-line', text: `${doneCount} of ${AG.chapters.length} chambers dug.` }),
        h('p', { class: 'small-links' }, h('a', { href: '#/glossary', text: 'Glossary of terms' }), resetBtn),
        resetSlot
      ),
      h('div', { class: 'home-map frame farm-frame-map' }, farmMap())
    );
  }

  // -------------------------------------------------------------------------
  // Chapter page

  function chapterPage(ch) {
    const i = AG.chapters.indexOf(ch);
    document.title = `${i + 1}. ${ch.title} | ${GAME}`;
    const checklist = h('ul', { class: 'checklist' });
    const paintChecklist = () =>
      checklist.replaceChildren(
        ...ch.checkpoints.map(c => h('li', { class: AG.progress.passed(c.id) ? 'done' : '' }, h('span', { class: 'box', 'aria-hidden': 'true' }), c.label))
      );
    paintChecklist();
    const onProgress = () => paintChecklist();
    document.addEventListener('ag:progress', onProgress);
    AG.onLeave(() => document.removeEventListener('ag:progress', onProgress));

    const body = h('div', { class: 'chapter-body' });
    ch.build(body);

    const prev = AG.chapters[i - 1];
    const next = AG.chapters[i + 1];
    return h('main', { class: 'chapter' },
      h('header', { class: 'ch-header' },
        h('div', { class: 'ch-num', 'aria-hidden': 'true', text: String(i + 1) }),
        h('div', null,
          h('p', { class: 'ch-of', text: `Chapter ${i + 1} of ${AG.chapters.length}` }),
          h('h1', { text: ch.title }),
          h('p', { class: 'ch-short', text: ch.short }),
          h('div', { class: 'ch-goals' }, h('span', { text: 'To finish this chapter:' }), checklist)
        )
      ),
      body,
      h('nav', { class: 'ch-nav', 'aria-label': 'Chapters' },
        prev ? h('a', { class: 'btn ghost', href: `#/c/${prev.id}` }, `Back to chapter ${i}: ${prev.title}`) : h('span'),
        next ? h('a', { class: 'btn', href: `#/c/${next.id}` }, `On to chapter ${i + 2}: ${next.title}`) : h('a', { class: 'btn', href: '#/' }, 'Back to the farm')
      )
    );
  }

  function glossaryPage() {
    document.title = `Glossary | ${GAME}`;
    return h('main', { class: 'chapter glossary' },
      h('header', { class: 'ch-header plain' }, h('div', null, h('h1', { text: 'Glossary' }), h('p', { class: 'ch-short', text: 'Every term the game uses, in the game’s words and in the words interviewers use.' }))),
      h('dl', { class: 'gloss' },
        AG.GLOSSARY.map(g => [
          h('dt', { id: 'g-' + g.term.toLowerCase().replace(/[^a-z]+/g, '-') }, g.term, g.ch ? h('a', { class: 'gloss-ch', href: `#/c/${g.ch}`, text: 'chapter ' + (AG.chapters.findIndex(c => c.id === g.ch) + 1) }) : null),
          h('dd', { html: g.def }),
        ])
      )
    );
  }

  function topbar() {
    const doneCount = AG.chapters.filter(c => AG.progress.chapterState(c) === 'done').length;
    return h('div', { class: 'topbar' },
      h('a', { class: 'home-link', href: '#/' }, AG.antIcon('#2a1a12', 30), h('span', { text: GAME })),
      h('span', { class: 'topbar-progress', text: `${doneCount} / ${AG.chapters.length} chambers dug` })
    );
  }

  function render() {
    AG.leave();
    const hash = location.hash;
    let page;
    let m;
    if ((m = hash.match(/^#\/c\/([\w-]+)/))) {
      const ch = AG.chapters.find(c => c.id === m[1]);
      page = ch ? chapterPage(ch) : home();
    } else if (hash.startsWith('#/glossary')) {
      page = glossaryPage();
    } else {
      page = home();
    }
    app.replaceChildren(topbar(), page);
    const anchor = hash.split('#')[2];
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    else window.scrollTo(0, 0);
    const heading = app.querySelector('h1');
    if (heading && hash) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  document.addEventListener('ag:progress', () => {
    const tp = app.querySelector('.topbar-progress');
    if (tp) tp.textContent = `${AG.chapters.filter(c => AG.progress.chapterState(c) === 'done').length} / ${AG.chapters.length} chambers dug`;
  });
  window.addEventListener('hashchange', render);
  render();
})();
