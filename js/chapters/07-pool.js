'use strict';

(function () {
  const { h, prose, code } = AG;

  // An animated crawl run by real async code in the page.
  //   variant 'pool'  : a fixed list of jobs, no discovery
  //   variant 'naive' : discovery, but ants quit when the queue is empty
  function CrawlDemo({ title, graph, variant, ants: startAnts, slider = false, codeText }) {
    let n = startAnts;
    let gen = 0;
    let farm;
    const farmSlot = h('div');
    const queueList = h('ul', { class: 'slips' });
    const notes = h('ul', { class: 'demo-notes', 'aria-live': 'polite' });
    const readout = h('p', { class: 'readout', 'aria-live': 'polite' });
    const runBtn = h('button', { class: 'btn', text: 'Run', onclick: run });
    const rand = AG.rng(3);
    const delays = {};
    for (const u of Object.keys(graph.pages)) delays[u] = 650 + Math.floor(rand() * 850);
    for (const [u, ms] of Object.entries(graph.slow)) delays[u] = ms * 6;

    const label = h('label', { for: 'pool-n-' + variant });
    const input = slider
      ? h('input', { type: 'range', id: 'pool-n-' + variant, min: 1, max: 6, value: n, oninput: e => { n = +e.target.value; label.textContent = `Ants: ${n}`; setup(); } })
      : null;
    if (slider) label.textContent = `Ants: ${n}`;

    function initialQueue() {
      return variant === 'pool' ? [...graph.pages[graph.start]] : [graph.start];
    }
    function paintQueue(queue) {
      queueList.replaceChildren(...(queue.length ? queue.map(u => h('li', { class: 'slip', text: AG.label(u) })) : [h('li', { class: 'slip empty', text: 'empty' })]));
    }
    function setup() {
      gen++;
      farm = new AG.Farm(graph, { ants: n });
      farmSlot.replaceChildren(farm.el);
      const queue = initialQueue();
      if (variant === 'pool') farm.state(graph.start, 'done');
      queue.forEach(u => farm.state(u, 'seen'));
      paintQueue(queue);
      notes.replaceChildren();
      readout.textContent = 'Press Run to start the ants.';
    }

    async function run() {
      setup();
      const my = gen;
      const alive = () => my === gen;
      const host = AG.hostOf(graph.start);
      const queue = initialQueue();
      const seen = new Set([graph.start, ...queue]);
      let active = 0;
      let most = 0;
      const t0 = performance.now();
      const secs = () => ((performance.now() - t0) / 1000).toFixed(1);
      runBtn.disabled = true;

      async function ant(a) {
        while (queue.length > 0) {
          const url = queue.shift();
          paintQueue(queue);
          active++;
          most = Math.max(most, active);
          farm.place(a, url);
          farm.mode(a, 'walking');
          farm.state(url, 'active');
          await AG.wait(delays[url]);
          if (!alive()) return;
          farm.state(url, 'done');
          farm.mode(a, null);
          if (variant === 'naive') {
            for (const link of graph.pages[url] || []) {
              if (AG.hostOf(link) === host && !seen.has(link)) {
                seen.add(link);
                queue.push(link);
                farm.state(link, 'seen');
              }
            }
            paintQueue(queue);
          }
          active--;
        }
        farm.mode(a, null);
        farm.place(a, 'home');
        notes.append(h('li', null, h('strong', { style: { color: a.info.color }, text: a.info.name }), ` found the queue empty at ${secs()} s and went home.`));
      }

      await Promise.all(farm.ants.map(ant));
      if (!alive()) return;
      runBtn.disabled = false;
      readout.innerHTML = `Finished in <strong>${secs()} s</strong>. At most ${most} ant${most === 1 ? ' was' : 's were'} out at once.` +
        (variant === 'naive' && most < n ? ` The other ${n - most === 1 ? 'ant' : n - most + ' ants'} went home before any work existed for them.` : '');
    }

    AG.onLeave(() => gen++);
    setup();
    return AG.frame(title,
      h('div', { class: 'two-col' },
        h('div', null, h('div', { html: code(codeText) }), slider ? h('div', { class: 'slider' }, label, input) : null, h('div', { class: 'row' }, runBtn, h('button', { class: 'btn ghost', text: 'Reset', onclick: () => { setup(); runBtn.disabled = false; } }))),
        h('div', null, farmSlot, h('div', { class: 'panel' }, h('h4', { text: 'The queue' }), queueList))
      ),
      notes,
      readout
    );
  }

  const snap = rows => `<div class="snap">${rows.map(r => `<div>${r}</div>`).join('')}</div>`;

  AG.chapter({
    id: 'pool',
    title: 'The job board',
    short: 'Worker pools, numWorkers, and knowing when you’re done',
    checkpoints: [
      { id: 'pool-code', label: 'Build a worker pool' },
      { id: 'pool-queen', label: 'Answer the queen’s question' },
    ],
    build(root) {
      root.append(
        prose(`
          <p>Your chapter 5 crawler sends a new ant into every tunnel the moment it is found. On the big colony, the replay showed a crowd of ants out at once. On a real website with ten thousand pages, that would be thousands of requests fired at the same moment. The site would start refusing you, your computer would run out of network connections, and you’d be a rude guest either way.</p>
          <p>That’s why the interview version of the problem gives you <code>numWorkers</code>: <strong>at most this many ants may be out at once.</strong></p>

          <h2>A fixed team and a job board</h2>
          <p>The standard shape is a <strong>worker pool</strong>. Instead of one ant per job, you start a fixed team of <code>numWorkers</code> ants, and they share one queue of jobs, the job board. Each ant runs the same loop: take the next job, do it, come back for another, and stop when there are no jobs left.</p>
          <p>Notice that the check <code>queue.length > 0</code> and the take <code>queue.shift()</code> sit in the same turn. Two ants can never both see “one job left” and both grab it. That’s chapter 5’s lesson doing its job.</p>
        `),
        CrawlDemo({
          title: 'A worker pool on a fixed list',
          graph: AG.G.pool,
          variant: 'pool',
          ants: 3,
          slider: true,
          codeText: `
async function ant() {
  while (queue.length > 0) {
    const url = queue.shift();
    await scout(url);
  }
}

// start the team, then wait for all of it
await Promise.all([ant(), ant(), ant()]);
`,
        }),
        prose(`
          <p>Try one ant, then three, then six. With more ants the jobs overlap, just like chapter 2’s timeline. Also notice that ants don’t take turns in lockstep: whoever finishes first grabs the next job. Nobody waits for a whole group to finish.</p>
        `),
        AG.Challenge({
          id: 'pool-code',
          title: 'Build a worker pool',
          brief: `
            <p>Write <code>runPool(tasks, n)</code>. <code>tasks</code> is an array of functions; calling one starts a job and returns a promise of its result. Run every task, with <strong>at most <code>n</code> running at once</strong>, and return an array of their results in the same order as <code>tasks</code>.</p>
            <p>This is the same idea as the demo, except the job board is an index into the array instead of a queue.</p>`,
          starter: `async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let next = 0;   // index of the next task nobody has taken yet

  async function ant() {
    // Keep taking the next task until none are left.
    // Store each result at the same index as its task.
  }

  // Start n ants (never more than there are tasks) and wait for all of them.

  return results;
}
`,
          exports: ['runPool'],
          hints: [
            'An ant’s loop: while <code>next &lt; tasks.length</code>, claim an index with <code>const i = next++;</code> (checking and claiming happen in the same turn, so it’s safe), run <code>tasks[i]()</code>, and store the awaited result in <code>results[i]</code>.',
            'Starting the team: make an array of ant promises, <code>const team = [];</code> then <code>team.push(ant())</code> in a loop that runs <code>Math.min(n, tasks.length)</code> times. Finally, <code>await Promise.all(team)</code>.',
            'A tempting wrong answer is to split the tasks into groups of <code>n</code> and <code>Promise.all</code> each group. That makes fast ants wait for the slowest ant in their group. The last test catches it.',
          ],
          solution: `async function runPool(tasks, n) {
  const results = new Array(tasks.length);
  let next = 0;

  async function ant() {
    while (next < tasks.length) {
      const i = next++;                // claim a task (same turn as the check)
      results[i] = await tasks[i]();   // do it; other ants run meanwhile
    }
  }

  const team = [];
  for (let k = 0; k < Math.min(n, tasks.length); k++) team.push(ant());
  await Promise.all(team);
  return results;
}
`,
          tests: function (test, T, U) {
            const make = (durations, s) =>
              durations.map((ms, i) => async () => {
                s.active++;
                s.max = Math.max(s.max, s.active);
                await T.sleep(ms);
                s.active--;
                return 'result ' + i;
              });
            const expect = k => Array.from({ length: k }, (_, i) => 'result ' + i);
            const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every((x, i) => a[i] === x);
            const complete = (got, k) => T.ok(same(got, expect(k)), 'Not every task’s result came back: got ' + JSON.stringify(got) + '. Each ant should store its result with results[i] = await tasks[i]().');

            test('Returns every result, in task order', async () => {
              const s = { active: 0, max: 0 };
              const got = await U.runPool(make([60, 20, 40, 10, 30], s), 2);
              T.ok(same(got, expect(5)), 'Expected ' + JSON.stringify(expect(5)) + ' but got ' + JSON.stringify(got) + '.');
            });
            test('Never more than n tasks at once', async () => {
              const s = { active: 0, max: 0 };
              complete(await U.runPool(make([30, 30, 30, 30, 30, 30, 30, 30], s), 3), 8);
              T.ok(s.max <= 3, `At one point ${s.max} tasks were running, but n was 3.`);
            });
            test('Uses all n ants', async () => {
              const s = { active: 0, max: 0 };
              await U.runPool(make([30, 30, 30, 30, 30, 30, 30, 30], s), 3);
              T.ok(s.max === 3, `Only ${s.max} task${s.max === 1 ? ' was' : 's were'} ever running at once. With 8 tasks and n = 3, three should run together.`);
            });
            test('More ants than tasks is fine', async () => {
              const s = { active: 0, max: 0 };
              const got = await U.runPool(make([20, 20], s), 5);
              T.ok(same(got, expect(2)), 'Expected ' + JSON.stringify(expect(2)) + ' but got ' + JSON.stringify(got) + '.');
            });
            test('No tasks gives an empty array', async () => {
              const got = await U.runPool([], 3);
              T.ok(Array.isArray(got) && got.length === 0, 'Expected [] but got ' + JSON.stringify(got) + '.');
            });
            test('Keeps every ant busy (no waiting for a whole group)', async () => {
              const s = { active: 0, max: 0 };
              const t0 = T.now();
              complete(await U.runPool(make([300, 50, 50, 50, 50, 50, 50], s), 2), 7);
              const ms = Math.round(T.now() - t0);
              T.ok(ms < 400, `That took ${ms} ms. One ant can do the 300 ms task while the other does all six 50 ms tasks, about 300 ms in total. Taking tasks in fixed groups makes fast ants wait for slow ones.`);
            });
          },
          passText: 'Every test passes. That’s a worker pool: the shape at the heart of the final crawler.',
        }),
        prose(`
          <h2>The twist: jobs that make jobs</h2>
          <p>A crawler doesn’t have a fixed list. It starts with <em>one</em> job, the entrance, and every job can discover new ones. Here is the same worker pool, now pushing newly found chambers onto the queue. The colony has one long tunnel at the entrance, and everything else lies beyond it. Predict what the three ants will do, then run it.</p>
        `),
        CrawlDemo({
          title: 'Ants who go home too early',
          graph: AG.G.trap,
          variant: 'naive',
          ants: 3,
          codeText: `
async function ant() {
  while (queue.length > 0) {
    const url = queue.shift();
    const links = await getLinks(url);
    for (const link of links) {
      // claim and queue new chambers
    }
  }
  // the queue was empty, so go home
}
`,
        }),
        prose(`
          <p>Ada takes the entrance. Bo and Cy look at the job board, see nothing, and conclude there is no work: they go home. Ada comes back with a tunnel, then eight caves, and has to scout them all by herself. The map is still correct, but you paid for three ants and got one.</p>
          <p>It could be worse. If the queen were the one deciding “the queue is empty, so we’re done”, she would announce a finished map while Ada was still out walking, and the map would be missing most of the colony.</p>

          <div class="idea">
            <p><strong>An empty queue does not mean the work is done.</strong> The queue only shows work that is <em>waiting</em>. Work that is <em>in progress</em> is invisible on the board, and in-progress work can create new work. Any ant who is out scouting may come back with new chambers.</p>
          </div>

          <h2>The real stopping rule</h2>
          <p>The crawl is finished only when <strong>the queue is empty and no ant is busy</strong>. So we count the busy ants with a shared counter, usually called <code>active</code>. Where you change the counter matters as much as having it:</p>
          ${code(`
const url = queue.shift();
active++;                            // same turn as the shift

const links = await getLinks(url);   // other ants take turns here

for (const link of links) {          // put the new work on the board...
  if (getHost(link) === host && !seen.has(link)) {
    seen.add(link);
    queue.push(link);
  }
}
active--;                            // ...and only then stop counting yourself
`)}
          <p>The rule is that <strong>no job may ever be invisible</strong>: at every moment, each piece of work is either on the board or counted in <code>active</code>. If you did <code>active--</code> before pushing the new links, there would be a moment when the queue is empty, <code>active</code> is 0, and yet new work is about to appear. The <code>active++</code> goes in the same turn as the <code>shift</code> for the same reason.</p>
          <p>The queen has some questions for you.</p>
        `),
        AG.Quiz({
          id: 'pool-queen',
          title: 'The queen’s question: are we done?',
          questions: [
            {
              q: `Is the crawl finished? ${snap(['Queue: <em>empty</em>', 'Ada: walking to <code>/food/seeds</code>', 'Bo: idle', 'Cy: idle'])}`,
              options: ['Yes', 'No'],
              answer: 1,
              explain: 'Right. Ada is out, and she might come back with new chambers. The empty queue says nothing about her.',
              wrong: { 0: 'The queue is empty, but Ada is still out walking. She could find five new chambers.' },
            },
            {
              q: `Is the crawl finished? ${snap(['Queue: <code>/queen</code>', 'Ada: idle', 'Bo: idle', 'Cy: idle'])}`,
              options: ['Yes', 'No'],
              answer: 1,
              explain: 'Right. Nobody is busy, but a job is waiting on the board. Someone should take it.',
              wrong: { 0: 'Everyone is idle, but there is a slip on the board. That chamber hasn’t been scouted.' },
            },
            {
              q: `Is the crawl finished? ${snap(['Queue: <em>empty</em>', 'Ada: idle', 'Bo: idle', 'Cy: idle', '<code>active</code> is 0'])}`,
              options: ['Yes', 'No'],
              answer: 0,
              explain: 'Right. Nothing is waiting and nothing is in progress, so no new work can ever appear. Done.',
              wrong: { 1: 'What could still produce work? Nothing is on the board and nobody is out. This is the end.' },
            },
            {
              q: `Is the crawl finished? ${snap(['Queue: <em>empty</em>', 'Ada: just got back from <code>/nursery</code> and is looping over its links (she hasn’t done <code>active--</code> yet)', 'Bo: idle', 'Cy: idle'])}`,
              options: ['Yes', 'No'],
              answer: 1,
              explain: 'Right. Ada is still busy. Coming back from the walk isn’t the end of the job; sorting the links is part of it, and she may be about to push new chambers.',
              wrong: { 0: 'Ada is back from walking, but she’s still processing the links, and she may be about to push new chambers onto the board.' },
            },
            {
              q: 'Which condition should the crawl use to decide that it’s finished?',
              options: ['<code>queue.length === 0</code>', '<code>active === 0</code>', '<code>queue.length === 0 && active === 0</code>'],
              answer: 2,
              explain: 'Right. Nothing waiting, and nothing in progress.',
              wrong: { 0: 'That’s the trap from the demo: an ant might be out finding more work.', 1: 'At the very start, before anyone has taken the entrance slip, <code>active</code> is 0 but there is work on the board.' },
            },
          ],
        }),
        prose(`
          <h2>So what should an idle ant do?</h2>
          <p>Suppose Bo finds the queue empty while Ada is still out. He can’t go home, because Ada may need help any second. So what does he do while he waits? Keep staring at the board? Check it every few milliseconds? Chapter 8 answers that, and the answer has a proper name in the concurrency world: a <strong>condition variable</strong>.</p>
        `)
      );
    },
  });
})();
