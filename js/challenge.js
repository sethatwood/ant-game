'use strict';

// A code challenge: brief, editor, tests, hints, and (optionally) a replay of
// the crawl the player's code performed.

(function () {
  const { h } = AG;

  // A textarea with a highlighted layer underneath it.
  AG.Editor = function Editor(initial, { onRun, label = 'Code editor' } = {}) {
    const pre = h('pre', { class: 'ed-hl', 'aria-hidden': 'true' });
    const gutter = h('div', { class: 'ed-gutter', 'aria-hidden': 'true' });
    const ta = h('textarea', { class: 'ed-input', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': label });
    ta.value = initial;
    let escaped = false;

    function paint() {
      const v = ta.value;
      pre.innerHTML = AG.highlight(v) + (v.endsWith('\n') ? ' ' : '');
      const n = v.split('\n').length;
      if (gutter.childElementCount !== n) gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
    ta.addEventListener('input', paint);
    ta.addEventListener('scroll', () => (pre.scrollLeft = ta.scrollLeft));
    ta.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onRun?.();
        return;
      }
      if (e.key === 'Escape') {
        escaped = true;
        return;
      }
      if (e.key === 'Tab' && !escaped) {
        e.preventDefault();
        const { selectionStart: a, selectionEnd: b, value } = ta;
        if (e.shiftKey) {
          const lineStart = value.lastIndexOf('\n', a - 1) + 1;
          if (value.slice(lineStart, lineStart + 2) === '  ') {
            ta.setRangeText('', lineStart, lineStart + 2, 'preserve');
            ta.selectionStart = ta.selectionEnd = Math.max(lineStart, a - 2);
          }
        } else {
          ta.setRangeText('  ', a, b, 'end');
        }
        paint();
        return;
      }
      escaped = false;
      if (e.key === 'Enter') {
        const { selectionStart: a, value } = ta;
        const lineStart = value.lastIndexOf('\n', a - 1) + 1;
        const indent = value.slice(lineStart).match(/^ */)[0];
        const extra = /[{(\[]\s*$/.test(value.slice(lineStart, a)) ? '  ' : '';
        e.preventDefault();
        ta.setRangeText('\n' + indent + extra, a, ta.selectionEnd, 'end');
        paint();
      }
    });
    const el = h('div', { class: 'editor' }, gutter, h('div', { class: 'ed-body' }, pre, ta));
    requestAnimationFrame(paint);
    paint();
    return {
      el,
      get value() {
        return ta.value;
      },
      set value(v) {
        ta.value = v;
        paint();
      },
      focus: () => ta.focus(),
    };
  };

  AG.Challenge = function Challenge(cfg) {
    const saved = AG.store.get('code:' + cfg.id, null);
    const editor = AG.Editor(saved ?? cfg.starter, { onRun: run, label: cfg.title });
    const results = h('ul', { class: 'results', 'aria-live': 'polite' });
    const summary = h('div', { class: 'summary' });
    const consoleBox = h('pre', { class: 'console' });
    const consoleWrap = h('details', { class: 'console-wrap', hidden: true }, h('summary', { text: 'Console output' }), consoleBox);
    const replayBox = h('div', { class: 'replay-box' });
    const hintBox = h('div', { class: 'hints' });
    let hintsShown = 0;
    let running = false;

    const runBtn = h('button', { class: 'btn', text: 'Run the tests', onclick: run });
    const hintBtn = cfg.hints?.length
      ? h('button', { class: 'btn ghost', text: 'Show a hint', onclick: showHint })
      : null;
    const resetBtn = h('button', { class: 'btn ghost', text: 'Reset code', onclick: () => confirmBar('Replace your code with the starter code?', 'Reset', () => { editor.value = cfg.starter; AG.store.remove('code:' + cfg.id); }) });
    const solBtn = cfg.solution
      ? h('button', { class: 'btn ghost', text: 'Show a solution', onclick: () => confirmBar('Show a working solution? Trying first teaches more, but a solution you study carefully teaches a lot too.', 'Show it', showSolution) })
      : null;
    const confirmSlot = h('div', { class: 'confirm-slot' });
    const solutionBox = h('div', { class: 'solution', hidden: true });

    let saveTimer = 0;
    editor.el.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => AG.store.set('code:' + cfg.id, editor.value), 400);
    });

    function confirmBar(text, yes, action) {
      confirmSlot.replaceChildren(
        h('div', { class: 'confirm' },
          h('span', { text }),
          h('button', { class: 'btn small', text: yes, onclick: () => { confirmSlot.replaceChildren(); action(); } }),
          h('button', { class: 'btn ghost small', text: 'Cancel', onclick: () => confirmSlot.replaceChildren() })
        )
      );
    }

    function showHint() {
      if (hintsShown >= cfg.hints.length) return;
      hintBox.append(h('div', { class: 'hint', html: `<strong>Hint ${hintsShown + 1} of ${cfg.hints.length}.</strong> ` + cfg.hints[hintsShown] }));
      hintsShown++;
      if (hintsShown === cfg.hints.length) hintBtn.disabled = true;
    }

    function showSolution() {
      solutionBox.hidden = false;
      solutionBox.replaceChildren(
        h('div', { html: AG.code(cfg.solution, { label: 'One working solution' }) }),
        cfg.solutionNotes ? h('div', { class: 'prose', html: cfg.solutionNotes }) : null,
        h('button', { class: 'btn ghost small', text: 'Copy it into the editor', onclick: () => { editor.value = cfg.solution; AG.store.set('code:' + cfg.id, cfg.solution); } })
      );
    }

    async function run() {
      if (running) return;
      running = true;
      runBtn.disabled = true;
      runBtn.textContent = 'Running…';
      AG.store.set('code:' + cfg.id, editor.value);
      results.replaceChildren();
      summary.className = 'summary';
      summary.textContent = '';
      consoleBox.textContent = '';
      consoleWrap.hidden = true;
      replayBox.replaceChildren();
      const rows = new Map();
      const outcomes = [];
      let loadError = null;
      let traceShown = null;
      await AG.runTests({
        code: editor.value,
        exports: cfg.exports,
        tests: AG.testSource(cfg.tests),
        onEvent(m) {
          if (m.type === 'start') {
            const li = h('li', { class: 'pending' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', { class: 'tname', text: m.name }));
            rows.set(m.name, li);
            results.append(li);
          } else if (m.type === 'result') {
            const li = rows.get(m.name);
            li.className = m.pass ? 'pass' : 'fail';
            if (m.bonus) li.classList.add('bonus');
            if (!m.pass) li.append(h('div', { class: 'why', text: m.message }));
            outcomes.push(m);
          } else if (m.type === 'log') {
            consoleWrap.hidden = false;
            consoleBox.append(h('span', { class: 'log-' + m.kind, text: m.text + '\n' }));
          } else if (m.type === 'trace') {
            if (!traceShown || m.label === cfg.replayLabel) traceShown = m;
          } else if (m.type === 'load-error') {
            loadError = m.message;
          } else if (m.type === 'frozen') {
            const li = rows.get(m.name);
            if (li) {
              li.className = 'fail';
              li.append(h('div', { class: 'why', text: m.message }));
            }
            outcomes.push({ name: m.name, pass: false });
            summary.dataset.frozen = '1';
          }
        },
      });
      running = false;
      runBtn.disabled = false;
      runBtn.textContent = 'Run the tests';

      if (loadError) {
        summary.className = 'summary bad';
        summary.textContent = 'Your code didn’t load: ' + loadError;
        return;
      }
      const required = outcomes.filter(o => !o.bonus);
      const expectedCount = rows.size;
      const passedAll = required.length > 0 && required.every(o => o.pass) && outcomes.length === expectedCount && !summary.dataset.frozen;
      delete summary.dataset.frozen;
      if (passedAll) {
        summary.className = 'summary good';
        const bonusMiss = outcomes.some(o => o.bonus && !o.pass);
        summary.innerHTML = (cfg.passText || 'Every test passes. Checkpoint complete.') + (bonusMiss ? ' The bonus test still fails; see its note above.' : '');
        AG.progress.pass(cfg.id);
        cfg.onPass?.();
      } else {
        summary.className = 'summary bad';
        const failed = outcomes.filter(o => !o.pass && !o.bonus).length;
        summary.textContent = `${failed || 'Some'} test${failed === 1 ? '' : 's'} failed. Read the notes under each failed test, change your code, and run again.`;
      }
      if (cfg.replay && traceShown && traceShown.trace.length) {
        replayBox.replaceChildren(AG.Replay(AG.G[traceShown.graph], traceShown.trace, { title: 'Replay: ' + traceShown.label }));
      }
    }

    const passedBefore = AG.progress.passed(cfg.id);
    return h(
      'section',
      { class: 'challenge' },
      h('div', { class: 'ch-head' }, h('h3', { text: cfg.title }), passedBefore ? h('span', { class: 'badge', text: 'Passed' }) : null),
      h('div', { class: 'prose ch-brief', html: cfg.brief }),
      editor.el,
      h('div', { class: 'row' }, runBtn, hintBtn, resetBtn, solBtn, h('span', { class: 'kbd-hint', text: '⌘/Ctrl + Enter runs the tests. Esc, then Tab, leaves the editor.' })),
      confirmSlot,
      hintBox,
      summary,
      results,
      consoleWrap,
      solutionBox,
      replayBox
    );
  };
})();
