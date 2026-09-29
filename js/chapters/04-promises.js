'use strict';

(function () {
  const { h, prose, code } = AG;

  const SNIPPET = `
async function scout() {
  console.log("scout: leaving");
  await walk(100);
  console.log("scout: back");
}

console.log("queen: start");
scout();
console.log("queen: end");
`;

  const STEPS = [
    { line: null, note: 'The script is about to run. Lines 1–5 only <em>define</em> scout; nothing inside it runs until somebody calls it.' },
    { line: 7, stack: ['the script', 'console.log'], out: ['queen: start'], note: 'The queen speaks first.' },
    { line: 8, stack: ['the script', 'scout()'], note: 'The script calls <code>scout()</code>. An async function starts running straight away, like any other function.' },
    { line: 2, stack: ['the script', 'scout()'], out: ['queen: start', 'scout: leaving'], note: 'scout prints its first line.' },
    { line: 3, stack: ['the script', 'scout()', 'walk(100)'], outside: ['timer: 100 ms, then fulfil the walk promise'], note: '<code>walk(100)</code> starts a timer and immediately returns a promise: an order slip that is still <em>pending</em>.' },
    { line: 3, stack: ['the script'], note: '<code>await</code> meets a pending promise, so scout is <strong>paused right here</strong> and set aside, with its place remembered. The brain returns to whoever called scout, which is the script. (Calling an async function always hands back a promise of its own, and that’s what <code>scout()</code> just returned.)' },
    { line: 9, stack: ['the script', 'console.log'], out: ['queen: start', 'scout: leaving', 'queen: end'], note: 'So “queen: end” prints before scout is back. The queen didn’t wait. Only scout waits.' },
    { line: null, stack: [], note: 'The script’s turn is over. There are no microtasks or tasks, so the brain is idle for about 100 ms. Nothing is blocked: clicks, or other ants, could be handled right now.' },
    { outside: [], tasks: ['timer done: fulfil the walk promise'], note: '100 ms later the timer is done, and its callback joins the task queue.' },
    { stack: ['fulfil the walk promise'], tasks: [], micro: ['resume scout after its await'], note: 'Fulfilling the promise schedules the rest of scout as a microtask.' },
    { line: 4, stack: ['scout() (resumed)'], micro: [], out: ['queen: start', 'scout: leaving', 'queen: end', 'scout: back'], note: 'scout resumes exactly where it paused and prints “scout: back”. This is a <strong>new turn</strong>. A lot could have happened in between.' },
    { line: null, stack: [], note: 'scout reaches its end, and the promise that <code>scout()</code> returned is fulfilled too.' },
  ];

  const SNIPPET_3 = `
async function ant(name, ms) {
  console.log(name + " leaves");
  await walk(ms);
  console.log(name + " returns");
}

ant("Ada", 200);
ant("Bo", 100);
console.log("queen waits");
`;

  // Race the two ways of scouting five chambers.
  function SeqVsAll() {
    const jobs = [['/food', 700], ['/nursery', 400], ['/queen', 900], ['/food/seeds', 500], ['/nursery/eggs', 600]];
    let gen = 0;
    const rows = jobs.map(([name]) => {
      const fill = h('div', { class: 'bar-fill' });
      return { fill, el: h('div', { class: 'bar-row' }, h('code', { text: name }), h('div', { class: 'bar-track' }, fill)) };
    });
    const readout = h('p', { class: 'readout', 'aria-live': 'polite', text: 'Pick a version to run.' });

    function resetBars() {
      rows.forEach(r => {
        r.fill.style.transition = 'none';
        r.fill.style.width = '0%';
      });
      void rows[0].fill.offsetWidth;
    }
    async function walkBar(i, my) {
      const [, ms] = jobs[i];
      rows[i].fill.style.transition = `width ${ms}ms linear`;
      rows[i].fill.style.width = '100%';
      await AG.wait(ms);
      if (my !== gen) throw new Error('stale');
    }
    async function run(mode) {
      const my = ++gen;
      resetBars();
      readout.textContent = 'Running…';
      const t0 = performance.now();
      try {
        if (mode === 'seq') {
          for (let i = 0; i < jobs.length; i++) await walkBar(i, my);
        } else {
          await Promise.all(jobs.map((_, i) => walkBar(i, my)));
        }
      } catch {
        return;
      }
      const ms = Math.round(performance.now() - t0);
      readout.innerHTML = mode === 'seq'
        ? `One after another: <strong>${ms} ms</strong>, the sum of all five walks.`
        : `All at once: <strong>${ms} ms</strong>, just the longest single walk.`;
    }
    AG.onLeave(() => gen++);

    return AG.frame('One after another, or all at once?',
      h('div', { class: 'two-col' },
        h('div', null,
          h('div', { html: code(`
const results = [];
for (const url of urls) {
  results.push(await getLinks(url));
}
`) }),
          h('button', { class: 'btn', text: 'Run one after another', onclick: () => run('seq') })
        ),
        h('div', null,
          h('div', { html: code(`
const results = await Promise.all(
  urls.map(url => getLinks(url))
);
`) }),
          h('button', { class: 'btn', text: 'Run all at once', onclick: () => run('all') })
        )
      ),
      h('div', { class: 'bars' }, rows.map(r => r.el)),
      readout
    );
  }

  AG.chapter({
    id: 'promises',
    title: 'Order slips',
    short: 'Promises, async and await, and doing things at the same time',
    checkpoints: [
      { id: 'promises-predict', label: 'Predict the output of both async snippets' },
      { id: 'promises-code', label: 'Scout five chambers at once' },
    ],
    build(root) {
      const solved = new Set();
      const solvedOne = key => ok => {
        if (ok === false) return;
        solved.add(key);
        if (solved.size === 2) AG.progress.pass('promises-predict');
      };

      root.append(
        prose(`
          <p>Callbacks work, but they get awkward fast. “Walk to /food, and when you’re back, walk to each tunnel you found, and when each of those is back…” turns into functions inside functions inside functions. Modern JavaScript has a better tool.</p>

          <h2>A promise is an order slip</h2>
          <p>When an ant sets off, she hands you a slip right away. It says: “I owe you this chamber’s tunnels. I’ll fill this in when I’m back.” That slip is a <strong>promise</strong>. In real code, <code>getLinks</code> doesn’t return links; it returns a promise of links, immediately, before any walking has happened.</p>
          ${code(`
const slip = getLinks("https://anthill.org/food");
console.log(slip);      // Promise { <pending> }: the ant is still walking

slip.then(links => {    // "when the slip is filled in, do this"
  console.log(links);   // ["https://anthill.org/food/seeds", ...]
});
`)}
          <p>A promise is always in one of three states:</p>
          <ul>
            <li><strong>pending</strong>: the ant is still out.</li>
            <li><strong>fulfilled</strong>: she’s back, and the slip holds a value (the links).</li>
            <li><strong>rejected</strong>: something went wrong (a cave-in, a network error), and the slip holds an error instead.</li>
          </ul>
          <p>Callbacks passed to <code>.then</code> run as microtasks, the urgent notes from chapter 3, once the promise is fulfilled.</p>

          <h2>async and await</h2>
          <p><code>.then</code> still means writing callbacks. <code>async</code> functions let you write the same thing as if it were ordinary step-by-step code:</p>
          ${code(`
async function scoutFood() {
  const links = await getLinks("https://anthill.org/food");
  console.log(links);   // runs later, when the ant is back
}
`)}
          <p><code>await slip</code> means: <em>pause this function until the slip is filled in, then give me what’s written on it.</em> You can only use <code>await</code> inside a function marked <code>async</code>. An async function always returns a promise itself, so whoever calls it can await it in turn.</p>

          <div class="idea">
            <p><strong>This is the most important idea in the game.</strong> <code class="aw">await</code> pauses <em>one function</em>, not the brain. When an ant reaches an await, her turn ends. The brain is free, and any other ant with work to do gets a turn. When she resumes, it’s a brand-new turn, and <strong>the world may have changed while she was away.</strong></p>
            <p>That’s why every <code class="aw">await</code> in this game is highlighted in blue. Each one is a door that other ants can walk through.</p>
          </div>

          <p>Test it. <code>walk(ms)</code> returns a promise that fulfils after <code>ms</code> milliseconds. What does this print?</p>
        `),
        AG.frame('Predict, then watch', AG.OrderPuzzle({ code: SNIPPET, lines: ['queen: start', 'scout: leaving', 'queen: end', 'scout: back'], onSolve: solvedOne('a') })),
        AG.EventLoop({ title: 'Step through an await', code: SNIPPET, steps: STEPS }),
        prose(`
          <div class="trap">
            <p><strong>The forgotten await.</strong> Leave out <code>await</code> and you get the slip instead of the links:</p>
            ${code(`
const links = getLinks(url);     // oops: a Promise, not an array
for (const link of links) { }    // TypeError: links is not iterable
`)}
            <p>If an error message ever mentions a <code>Promise</code> where you expected data, look for a missing await.</p>
          </div>

          <h2>Writing your own order slip</h2>
          <p>Where does a promise come from? You can make one with <code>new Promise</code>. You pass it a function, and JavaScript calls that function straight away with a <strong>resolve</strong> function. Calling <code>resolve(value)</code> fills in the slip.</p>
          ${code(`
function walk(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);   // fill in the slip when the timer is done
  });
}

await walk(1000);   // pauses this function for one second
`)}
          <p>Think of <code>resolve</code> as a <strong>remote control</strong> for the slip. Whoever holds it decides when the waiting ends. Here we handed it to a timer, but you could also keep it in a variable, or in a list, and press it later from somewhere else entirely. Chapters 6 and 8 are built on that trick.</p>

          <h2>Many ants at once</h2>
          <p>Now for real concurrency. Scouting five chambers one after another means five walks back to back. Starting all five walks first and <em>then</em> waiting means the walks overlap.</p>
        `),
        SeqVsAll(),
        prose(`
          <p><code>urls.map(url => getLinks(url))</code> calls <code>getLinks</code> five times in a row, in one turn. That sends out five ants and collects five slips. <code>Promise.all(slips)</code> makes one big slip that is fulfilled when every small slip is fulfilled. Its value is an array of the results <strong>in the same order as the slips you passed in</strong>, not the order the ants came back. (If any single slip is rejected, the big one is rejected too.)</p>
          <p>One more prediction. Two ants leave at almost the same time, and Ada has further to walk.</p>
        `),
        AG.frame('Predict once more', AG.OrderPuzzle({ code: SNIPPET_3, lines: ['Ada leaves', 'Bo leaves', 'queen waits', 'Bo returns', 'Ada returns'], onSolve: solvedOne('b') })),
        prose(`
          <p>Both ants run until their first <code class="aw">await</code> during the script’s turn, so both leave before the queen even speaks. After that, whoever’s walk ends first gets the next turn. Bo’s walk is shorter.</p>
        `),
        AG.Challenge({
          id: 'promises-code',
          title: 'Scout them all at once',
          brief: `
            <p>This <code>scoutAll</code> works, but it sends one ant at a time. Make it send them all at once. It should still return an array holding each chamber’s links, <strong>in the same order as <code>urls</code></strong>.</p>
            <p>The tests use chambers that each take 200 ms to scout. Five chambers one after another take 1,000 ms; all at once should take about 200.</p>`,
          starter: `async function scoutAll(urls, getLinks) {
  const results = [];
  for (const url of urls) {
    results.push(await getLinks(url));   // waits for each ant before sending the next
  }
  return results;
}
`,
          exports: ['scoutAll'],
          hints: [
            'You want to call <code>getLinks</code> for every URL <em>before</em> awaiting anything. <code>urls.map(url => getLinks(url))</code> gives you an array of promises.',
            'Pass that array to <code>Promise.all(...)</code> and <code>await</code> the result. It keeps the original order for you.',
          ],
          solution: `async function scoutAll(urls, getLinks) {
  const slips = urls.map(url => getLinks(url));  // send every ant now
  return await Promise.all(slips);               // then wait for all of them
}
`,
          tests: function (test, T, U) {
            function fakeWeb(delays) {
              const s = { active: 0, max: 0 };
              async function getLinks(url) {
                s.active++;
                s.max = Math.max(s.max, s.active);
                await T.sleep(delays[url] ?? 200);
                s.active--;
                return ['links of ' + url];
              }
              return { getLinks, s };
            }
            const urls = ['/a', '/b', '/c', '/d', '/e'].map(p => 'https://anthill.org' + p);
            const same = (got, want) => Array.isArray(got) && got.length === want.length && got.every((x, i) => Array.isArray(x) && x[0] === want[i]);

            test('Returns every chamber’s links', async () => {
              const { getLinks } = fakeWeb({});
              const got = await U.scoutAll(urls, getLinks);
              T.ok(Array.isArray(got), 'scoutAll should return (a promise of) an array. It returned ' + JSON.stringify(got) + '.');
              T.ok(same(got, urls.map(u => 'links of ' + u)), 'The array should hold, for each URL, the links getLinks returned for it.');
            });
            test('Sends all five ants at the same time', async () => {
              const { getLinks, s } = fakeWeb({});
              const t0 = T.now();
              await U.scoutAll(urls, getLinks);
              const ms = Math.round(T.now() - t0);
              T.ok(s.max === 5, `At most ${s.max} ant${s.max === 1 ? ' was' : 's were'} out at once, so it took ${ms} ms. All five should walk together.`);
            });
            test('Keeps the order of urls, not the order ants come back', async () => {
              const delays = {};
              urls.forEach((u, i) => (delays[u] = 250 - i * 50));
              const { getLinks } = fakeWeb(delays);
              const got = await U.scoutAll(urls, getLinks);
              T.ok(same(got, urls.map(u => 'links of ' + u)), 'The results came back in the order the ants returned. They should match the order of urls. Promise.all does this for you.');
            });
            test('An empty list gives an empty array', async () => {
              const { getLinks } = fakeWeb({});
              const got = await U.scoutAll([], getLinks);
              T.ok(Array.isArray(got) && got.length === 0, 'Expected [] but got ' + JSON.stringify(got) + '.');
            });
          },
          passText: 'Every test passes. Five ants, one brain, one walk’s worth of time.',
        }),
        prose(`
          <h2>Where we are</h2>
          <p>You can now send many ants at once and collect what they bring back. That’s the easy half of concurrency. The hard half starts when those ants share something, like the seen-set, and each of them reads it, walks through an <code class="aw">await</code>, and then acts on what they read. On to chapter 5.</p>
        `)
      );
    },
  });
})();
