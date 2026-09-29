'use strict';

// Step-through event loop. Each step is a snapshot; fields left out carry over
// from the previous step.

(function () {
  const { h } = AG;

  AG.EventLoop = function EventLoop({ title, code, steps }) {
    const snaps = [];
    let prev = { line: null, stack: [], outside: [], tasks: [], micro: [], out: [], note: '' };
    for (const st of steps) {
      prev = { ...prev, ...st };
      snaps.push(prev);
    }
    const srcLines = code.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
    let i = 0;

    const codeEl = h('ol', { class: 'el-code' });
    const panels = {
      stack: panel('The brain', 'the call stack: what is being thought about right now'),
      outside: panel('Out walking', 'timers and network requests the browser is handling'),
      micro: panel('Microtask queue', 'promise follow-ups; run as soon as the brain is free'),
      tasks: panel('Task queue', 'callbacks whose wait is over, taken one at a time'),
      out: panel('Console', 'what has been printed so far'),
    };
    const note = h('p', { class: 'el-note', 'aria-live': 'polite' });
    const counter = h('span', { class: 'el-counter' });
    const back = h('button', { class: 'btn ghost small', text: 'Back', onclick: () => go(i - 1) });
    const next = h('button', { class: 'btn small', text: 'Next step', onclick: () => go(i + 1) });
    const restart = h('button', { class: 'btn ghost small', text: 'Restart', onclick: () => go(0) });

    function panel(name, sub) {
      const list = h('ul', { class: 'el-list' });
      const el = h('div', { class: 'el-panel' }, h('h4', { text: name }), h('p', { class: 'el-sub', text: sub }), list);
      return { el, list };
    }

    function go(k) {
      i = Math.max(0, Math.min(snaps.length - 1, k));
      const sn = snaps[i];
      codeEl.replaceChildren(
        ...srcLines.map((ln, n) => h('li', { class: sn.line === n + 1 ? 'cur' : '' }, h('code', { html: AG.highlight(ln) || ' ' })))
      );
      for (const key of ['stack', 'outside', 'micro', 'tasks', 'out']) {
        const items = key === 'stack' ? sn.stack.slice().reverse() : sn[key];
        panels[key].list.replaceChildren(...(items.length ? items.map(t => h('li', { text: t })) : [h('li', { class: 'empty', text: 'empty' })]));
      }
      note.innerHTML = sn.note;
      counter.textContent = `Step ${i + 1} of ${snaps.length}`;
      back.disabled = i === 0;
      next.disabled = i === snaps.length - 1;
    }
    go(0);

    return AG.frame(
      title,
      h('div', { class: 'el-grid' },
        h('div', { class: 'el-left' }, h('pre', { class: 'code el-pre' }, codeEl), note),
        h('div', { class: 'el-right' }, panels.stack.el, panels.outside.el, panels.micro.el, panels.tasks.el, panels.out.el)
      ),
      h('div', { class: 'row' }, back, next, restart, counter)
    );
  };
})();
