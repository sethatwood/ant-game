'use strict';

// Small reusable widgets: ant icons, quizzes, ordering puzzles, the
// brain-and-legs timeline, and the crawl replay.

(function () {
  const { h, s } = AG;

  AG.antIcon = (color, size = 28) =>
    s('svg', { class: 'ant-icon', viewBox: '-16 -10 32 20', width: size, height: size * 0.62, 'aria-hidden': 'true' }, AG.antGlyph(color));

  // -------------------------------------------------------------------------
  // Quiz: every question must be answered correctly to pass. A wrong pick
  // explains itself and can be retried.

  AG.Quiz = function Quiz({ id, title = 'Check your understanding', questions }) {
    const done = new Set();
    const status = h('p', { class: 'quiz-status' });
    const update = () => {
      status.textContent = done.size === questions.length
        ? 'All correct. This checkpoint is complete.'
        : `${done.size} of ${questions.length} answered correctly.`;
      if (done.size === questions.length) {
        AG.progress.pass(id);
        status.classList.add('ok');
      }
    };
    const list = questions.map((q, qi) => {
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const opts = q.options.map((text, oi) =>
        h('button', {
          class: 'opt',
          html: text,
          onclick: e => {
            const right = oi === q.answer;
            e.currentTarget.classList.add(right ? 'right' : 'wrong');
            feedback.className = 'feedback ' + (right ? 'ok' : 'no');
            feedback.innerHTML = right ? q.explain : (q.wrong?.[oi] || 'Not quite. Try another answer.');
            if (right) {
              done.add(qi);
              opts.forEach(o => (o.disabled = true));
              update();
            }
          },
        })
      );
      return h('li', { class: 'question' }, h('div', { class: 'q', html: q.q }), h('div', { class: 'opts' }, opts), feedback);
    });
    if (AG.progress.passed(id)) status.textContent = 'You passed this before. Answer again anytime.';
    else update();
    return AG.frame(title, h('ol', { class: 'quiz' }, list), status);
  };

  // -------------------------------------------------------------------------
  // Predict-the-order puzzle: click the log lines in the order they print.

  AG.OrderPuzzle = function OrderPuzzle({ code, lines, onSolve }) {
    const pick = [];
    const answer = h('ol', { class: 'order-answer' });
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const rand = AG.rng(lines.join('').length);
    const shuffled = lines.map((t, i) => ({ t, i, k: rand() })).sort((a, b) => a.k - b.k);
    const chips = shuffled.map(({ t, i }) =>
      h('button', {
        class: 'chip',
        text: t,
        onclick: e => {
          pick.push(i);
          e.currentTarget.disabled = true;
          answer.append(h('li', { text: t }));
          if (pick.length === lines.length) check();
        },
      })
    );
    function check() {
      const right = pick.every((v, k) => v === k);
      feedback.className = 'feedback ' + (right ? 'ok' : 'no');
      feedback.textContent = right
        ? 'Exactly right.'
        : 'Not this time. The correct order is: ' + lines.join(' → ') + '. Step through it below to see why.';
      if (right) onSolve?.();
      else onSolve?.(false);
    }
    const reset = h('button', {
      class: 'btn ghost small',
      text: 'Start over',
      onclick: () => {
        pick.length = 0;
        answer.replaceChildren();
        chips.forEach(c => (c.disabled = false));
        feedback.className = 'feedback';
        feedback.textContent = '';
      },
    });
    return h(
      'div',
      { class: 'order-puzzle' },
      h('div', { html: AG.code(code) }),
      h('p', { class: 'hint-line', text: 'Click the printed lines in the order they appear in the console:' }),
      h('div', { class: 'chips' }, chips),
      answer,
      h('div', { class: 'row' }, reset),
      feedback
    );
  };

  // -------------------------------------------------------------------------
  // Timeline: ants share one brain. Thinking needs the brain; walking doesn't.

  function simulate(nAnts, think, walk, nJobs) {
    const segs = [];
    const ants = [];
    let next = 0;
    let brainFree = 0;
    for (let i = 0; i < nAnts; i++) {
      if (next < nJobs) ants.push({ i, phase: 1, reqAt: 0, job: next++ });
      else ants.push({ i, phase: 0 });
    }
    for (;;) {
      const waiting = ants.filter(a => a.phase).sort((a, b) => a.reqAt - b.reqAt || a.i - b.i);
      if (!waiting.length) break;
      const a = waiting[0];
      const start = Math.max(a.reqAt, brainFree);
      if (start > a.reqAt + 1e-9) segs.push({ ant: a.i, kind: 'queue', start: a.reqAt, end: start });
      const end = start + think;
      segs.push({ ant: a.i, kind: 'think', start, end, job: a.job });
      brainFree = end;
      if (a.phase === 1) {
        segs.push({ ant: a.i, kind: 'walk', start: end, end: end + walk, job: a.job });
        a.phase = 2;
        a.reqAt = end + walk;
      } else if (next < nJobs) {
        a.phase = 1;
        a.reqAt = end;
        a.job = next++;
      } else {
        a.phase = 0;
      }
    }
    const total = Math.max(0, ...segs.map(x => x.end));
    return { segs, total };
  }
  AG.simulateBrain = simulate;

  AG.Timeline = function Timeline() {
    const PRESETS = {
      walky: { think: 0.1, walk: 1.0, label: 'Mostly walking (like fetching web pages)' },
      thinky: { think: 0.55, walk: 0.1, label: 'Mostly thinking (like heavy calculations)' },
    };
    let nAnts = 1;
    let preset = 'walky';
    const JOBS = 6;
    const chart = h('div', { class: 'timeline-chart' });
    const readout = h('p', { class: 'readout', 'aria-live': 'polite' });
    const slider = h('input', { type: 'range', min: 1, max: 6, value: 1, id: 'tl-ants', oninput: e => { nAnts = +e.target.value; draw(); } });
    const sliderLabel = h('label', { for: 'tl-ants' });
    const presetBtns = Object.entries(PRESETS).map(([k, p]) =>
      h('button', { class: 'toggle', 'aria-pressed': String(k === preset), text: p.label, onclick: () => { preset = k; presetBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(Object.keys(PRESETS)[j] === preset))); draw(); } })
    );

    function draw() {
      const { think, walk } = PRESETS[preset];
      const { segs, total } = simulate(nAnts, think, walk, JOBS);
      const solo = simulate(1, think, walk, JOBS).total;
      sliderLabel.textContent = `Ants: ${nAnts}`;
      const scaleMax = Math.max(solo, 1);
      const W = 640;
      const rowH = 26;
      const left = 64;
      const rows = nAnts + 1;
      const H = rows * (rowH + 8) + 34;
      const x = t => left + (t / scaleMax) * (W - left - 12);
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'timeline-svg', role: 'img', 'aria-label': `Timeline for ${nAnts} ants` });
      const rowY = r => 6 + r * (rowH + 8);
      svg.append(s('text', { x: 0, y: rowY(0) + 17, class: 'row-label brain', text: 'the brain' }));
      for (let a = 0; a < nAnts; a++) {
        svg.append(s('text', { x: 0, y: rowY(a + 1) + 17, class: 'row-label', text: AG.ANTS[a].name, fill: AG.ANTS[a].color }));
        svg.append(s('rect', { x: left, y: rowY(a + 1), width: W - left - 12, height: rowH, class: 'lane' }));
      }
      svg.append(s('rect', { x: left, y: rowY(0), width: W - left - 12, height: rowH, class: 'lane brain-lane' }));
      for (const seg of segs) {
        const w = Math.max(1.5, x(seg.end) - x(seg.start));
        const y = rowY(seg.ant + 1);
        svg.append(s('rect', { x: x(seg.start), y: y + 3, width: w, height: rowH - 6, rx: 4, class: 'seg ' + seg.kind }));
        if (seg.kind === 'think') {
          svg.append(s('rect', { x: x(seg.start), y: rowY(0) + 3, width: w, height: rowH - 6, rx: 3, fill: AG.ANTS[seg.ant].color, class: 'brain-seg' }));
        }
      }
      for (let t = 0; t <= scaleMax + 1e-9; t += 1) {
        svg.append(s('line', { x1: x(t), x2: x(t), y1: H - 30, y2: H - 24, class: 'tick' }));
        svg.append(s('text', { x: x(t), y: H - 10, 'text-anchor': 'middle', class: 'tick-label', text: t + 's' }));
      }
      svg.append(s('line', { x1: x(total), x2: x(total), y1: 0, y2: H - 30, class: 'finish' }));
      chart.replaceChildren(svg);
      const speedup = solo / total;
      readout.innerHTML = `${nAnts === 1 ? 'One ant' : nAnts + ' ants'} scouted ${JOBS} chambers in <strong>${total.toFixed(1)} s</strong>` +
        (nAnts > 1 ? ` — ${speedup.toFixed(1)}× faster than one ant.` : '.');
    }

    const legend = h('div', { class: 'legend' },
      h('span', { class: 'key think' }, 'thinking (using the brain)'),
      h('span', { class: 'key walk' }, 'walking (waiting — no brain needed)'),
      h('span', { class: 'key queue' }, 'waiting for the brain to be free')
    );
    draw();
    return AG.frame('Six chambers to scout', h('div', { class: 'controls' }, h('div', { class: 'slider' }, sliderLabel, slider), h('div', { class: 'toggles' }, presetBtns)), chart, legend, readout);
  };

  // -------------------------------------------------------------------------
  // Replay of a real crawl trace: [{url, start, end}] in milliseconds.

  AG.Replay = function Replay(graph, trace, { title = 'Replay of your crawl' } = {}) {
    const items = trace.slice().sort((a, b) => a.start - b.start);
    const laneEnds = [];
    for (const it of items) {
      let lane = laneEnds.findIndex(end => end <= it.start + 0.01);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = it.end;
      it.lane = lane;
    }
    const nLanes = Math.max(1, laneEnds.length);
    const total = Math.max(1, ...items.map(i => i.end));
    const farm = new AG.Farm(graph, { ants: Math.min(nLanes, 6) });
    let t = 0;
    let playing = false;
    let raf = 0;
    const scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Time', oninput: e => { stop(); t = (+e.target.value / 1000) * total; paint(); } });
    const clock = h('span', { class: 'clock' });
    const playBtn = h('button', { class: 'btn small', text: 'Play', onclick: () => (playing ? stop() : play()) });

    const W = 640;
    const laneH = 16;
    const gantt = s('svg', { class: 'gantt', viewBox: `0 0 ${W} ${nLanes * (laneH + 4) + 6}` });
    const gx = ms => 48 + (ms / total) * (W - 56);
    for (let l = 0; l < nLanes; l++) {
      const info = AG.ANTS[l % 6];
      gantt.append(s('text', { x: 0, y: 4 + l * (laneH + 4) + 12, class: 'row-label', fill: info.color, text: info.name }));
    }
    for (const it of items) {
      gantt.append(s('rect', { x: gx(it.start), y: 4 + it.lane * (laneH + 4), width: Math.max(2, gx(it.end) - gx(it.start)), height: laneH, rx: 3, fill: AG.ANTS[it.lane % 6].color, opacity: 0.85 }, s('title', { text: AG.label(it.url) })));
    }
    const cursor = s('line', { class: 'cursor', y1: 0, y2: nLanes * (laneH + 4) + 6 });
    gantt.append(cursor);

    function paint() {
      for (const u of farm.nodes.keys()) farm.state(u, 'unknown');
      farm.state(graph.start, 'seen');
      const busy = new Map();
      for (const it of items) {
        if (it.end <= t) farm.state(it.url, 'done');
        else if (it.start <= t) {
          farm.state(it.url, 'active');
          busy.set(it.lane, it.url);
        }
      }
      farm.ants.forEach((ant, lane) => {
        const where = busy.get(lane);
        if (where && farm.has(where)) {
          if (ant.at !== where) farm.place(ant, where);
          farm.mode(ant, 'walking');
        } else {
          if (ant.at !== 'nest') farm.place(ant, 'nest');
          farm.mode(ant, 'idle');
        }
      });
      cursor.setAttribute('x1', gx(t));
      cursor.setAttribute('x2', gx(t));
      scrub.value = String(Math.round((t / total) * 1000));
      clock.textContent = `${Math.round(t)} ms of ${Math.round(total)} ms`;
    }
    function play() {
      if (t >= total) t = 0;
      playing = true;
      playBtn.textContent = 'Pause';
      let last = performance.now();
      const slow = 5000 / total;
      const step = now => {
        t = Math.min(total, t + (now - last) / slow);
        last = now;
        paint();
        if (t < total && playing) raf = requestAnimationFrame(step);
        else stop();
      };
      raf = requestAnimationFrame(step);
    }
    function stop() {
      playing = false;
      playBtn.textContent = 'Play';
      cancelAnimationFrame(raf);
    }
    AG.onLeave(stop);
    paint();
    const peak = Math.max(...items.map(a => items.filter(b => b.start <= a.start && b.end > a.start).length), 0);
    return AG.frame(
      title,
      farm.el,
      h('div', { class: 'replay-controls' }, playBtn, scrub, clock),
      h('div', { class: 'gantt-wrap' }, gantt),
      h('p', { class: 'readout', text: `${items.length} chambers scouted. At most ${peak} ants were out at once. Each bar is one getLinks call; hover a bar to see its page.` })
    );
  };
})();
