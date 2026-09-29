'use strict';

// "You are the scheduler": two or three ants run small programs against shared
// state, and the player decides who goes next.
//
// In 'await' mode an ant runs until it reaches its next await, exactly like
// JavaScript: nothing can cut in between two awaits. In 'line' mode every line
// is a separate step, like threads in most other languages.
//
// A line is { src, run } or, for a slow step, { src, pause: true, start, finish,
// blocked }. `run` may return 'return' to end that ant's program.

(function () {
  const { h } = AG;

  AG.Scheduler = function Scheduler(cfg) {
    const mode = cfg.mode || 'await';
    let shared;
    let ants;
    let won = false;

    const logList = h('ol', { class: 'sched-log', 'aria-live': 'polite' });
    const stateBox = h('div', { class: 'sched-state' });
    const goalBox = h('div', { class: 'sched-goal' });
    const cols = h('div', { class: 'sched-cols' });
    const whyBox = h('div', { class: 'why', hidden: true, html: cfg.why || '' });
    const whyBtn = cfg.why
      ? h('button', { class: 'btn ghost small', text: cfg.whyLabel || 'Why can’t I break it?', onclick: () => { whyBox.hidden = false; whyBtn.hidden = true; } })
      : null;

    function reset() {
      shared = cfg.setup();
      won = false;
      ants = cfg.ants.map((a, i) => ({
        ...a,
        i: a.ant ?? i,
        info: AG.ANTS[a.ant ?? i],
        pc: 0,
        status: 'ready',
        local: {},
      }));
      logList.replaceChildren();
      render();
    }

    function log(ant, text) {
      logList.append(h('li', null, ant ? h('strong', { style: { color: ant.info.color } }, ant.info.name + ': ') : null, text));
      logList.scrollTop = logList.scrollHeight;
    }

    function canMove(ant) {
      if (ant.status === 'done') return false;
      const line = ant.lines[ant.pc];
      if (line && line.blocked && (ant.status === 'paused' || !line.pause) && line.blocked(shared, ant)) return false;
      return true;
    }

    function step(ant) {
      if (!canMove(ant) || won) return;
      const say = text => log(ant, text);
      for (;;) {
        const line = ant.lines[ant.pc];
        if (!line) {
          ant.status = 'done';
          say('finished.');
          break;
        }
        if (line.pause) {
          if (ant.status === 'ready') {
            line.start?.(shared, ant, say);
            ant.status = 'paused';
            break;
          }
          if (line.blocked && line.blocked(shared, ant)) break;
          line.finish?.(shared, ant, say);
          ant.status = 'ready';
          ant.pc++;
          if (mode === 'line') break;
          continue;
        }
        if (line.blocked && line.blocked(shared, ant)) break;
        const r = line.run?.(shared, ant, say);
        ant.pc++;
        if (r === 'return') {
          ant.status = 'done';
          break;
        }
        if (mode === 'line') break;
      }
      render();
    }

    function statusText(ant) {
      if (ant.status === 'done') return 'finished';
      const line = ant.lines[ant.pc];
      if (ant.status === 'paused') {
        if (line.blocked && line.blocked(shared, ant)) return line.blockedText || 'waiting…';
        return line.waitText || 'waiting at the await; ready to continue';
      }
      if (line && !line.pause && line.blocked && line.blocked(shared, ant)) return line.blockedText || 'waiting…';
      return ant.pc === 0 ? 'ready to start' : 'ready';
    }

    function render() {
      stateBox.innerHTML = cfg.view(shared);
      cols.replaceChildren(
        ...ants.map(ant => {
          const items = [];
          ant.lines.forEach((line, k) => {
            const cls = ['line'];
            if (k < ant.pc) cls.push('ran');
            if (k === ant.pc && ant.status !== 'done') cls.push(ant.status === 'paused' ? 'here paused' : 'here');
            if (line.pause) cls.push('is-await');
            items.push(
              h('li', { class: cls.join(' ') },
                h('span', { class: 'marker', 'aria-hidden': 'true' }, k === ant.pc && ant.status !== 'done' ? AG.antIcon(ant.info.color, 22) : null),
                h('code', { html: AG.highlight(line.src) })
              )
            );
            if (mode === 'await' && line.pause && k < ant.lines.length - 1) {
              items.push(h('li', { class: 'door', text: 'other ants can take turns here' }));
            }
          });
          const btn = h('button', {
            class: 'btn ant-btn',
            style: { '--ant': ant.info.color },
            disabled: !canMove(ant) || won,
            text: mode === 'await' ? `Give ${ant.info.name} a turn` : `${ant.info.name}: next line`,
            onclick: () => step(ant),
          });
          return h('div', { class: 'sched-col' },
            h('div', { class: 'sched-head' }, AG.antIcon(ant.info.color, 30), h('strong', { text: ant.info.name }), h('span', { class: 'sched-status', text: statusText(ant) })),
            h('ol', { class: 'sched-code' + (mode === 'line' ? ' every-line' : '') }, items),
            btn
          );
        })
      );
      const reached = cfg.goal.test(shared, ants);
      if (reached && !won) {
        won = true;
        cfg.onWin?.();
        render();
        return;
      }
      goalBox.className = 'sched-goal' + (won ? ' won' : '');
      goalBox.innerHTML = won ? cfg.goal.win : `<strong>Your goal:</strong> ${cfg.goal.text}`;
      if (!won && ants.every(a => a.status === 'done')) {
        goalBox.innerHTML += `<p class="try-again">Everyone finished without reaching the goal. Press “Start over” to try a different order.</p>`;
      }
      cols.querySelectorAll('.ant-btn').forEach(b => (b.disabled = b.disabled || won));
    }

    reset();
    return AG.frame(
      cfg.title,
      goalBox,
      h('div', { class: 'sched-grid' }, cols, h('div', { class: 'sched-side' }, h('h4', { text: 'Shared state' }), stateBox, h('h4', { text: 'What happened' }), logList)),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost small', text: 'Start over', onclick: reset }), whyBtn),
      whyBox
    );
  };

  // Formats a Set for the state panel.
  AG.fmtSet = set => (set.size ? [...set].map(x => `<code>${AG.esc(x)}</code>`).join(' ') : '<em>empty</em>');
})();
