'use strict';

(function () {
  const { h, prose, code } = AG;

  const MODES = {
    pace: {
      label: 'Pace: check every so often',
      counter: 'useless checks of an empty board',
      code: `
// idle ant
while (queue.length === 0) {
  await sleep(250);    // look again in 250 ms
}
`,
    },
    one: {
      label: 'Sleep, and wake one per job',
      counter: 'pointless wake-ups',
      code: `
// idle ant
while (queue.length === 0) {
  await nursery.sleep();
}

// the ant who adds a job
queue.push(job);
nursery.wakeOne();
`,
    },
    all: {
      label: 'Sleep, and wake everyone per job',
      counter: 'pointless wake-ups',
      code: `
// idle ant
while (queue.length === 0) {
  await nursery.sleep();
}

// the ant who adds a job
queue.push(job);
nursery.wakeAll();
`,
    },
  };

  function NurseryDemo() {
    let mode = 'pace';
    let gen = 0;
    const WORKERS = 4;
    const codeSlot = h('div');
    const board = h('div', { class: 'board', 'aria-live': 'off' });
    const digLine = h('p', { class: 'stat-line', 'aria-live': 'polite' });
    const doneEl = h('strong', { text: '0' });
    const wasteEl = h('strong', { text: '0' });
    const wasteLabel = h('span');
    const stations = [];
    const stationWrap = h('div', { class: 'stations' });
    for (let i = 0; i < WORKERS; i++) {
      const what = h('span', { class: 'st-what' });
      const el = h('div', { class: 'station' }, h('span', { class: 'st-name' }, AG.antIcon(AG.ANTS[i].color, 26), AG.ANTS[i].name), what);
      stations.push({ el, what });
      stationWrap.append(el);
    }
    const toggles = Object.entries(MODES).map(([k, m]) =>
      h('button', { class: 'toggle', 'aria-pressed': String(k === mode), text: m.label, onclick: () => { mode = k; toggles.forEach((b, j) => b.setAttribute('aria-pressed', String(Object.keys(MODES)[j] === mode))); start(); } })
    );

    function set(i, cls, text) {
      stations[i].el.className = 'station ' + cls;
      stations[i].what.textContent = text;
    }

    function start() {
      const my = ++gen;
      const alive = () => my === gen;
      const queue = [];
      const sleepers = [];
      let done = 0;
      let wasted = 0;
      let nextJob = 1;
      const rand = AG.rng(11);
      codeSlot.innerHTML = code(MODES[mode].code);
      wasteLabel.textContent = MODES[mode].counter;
      const paint = () => {
        board.replaceChildren(...(queue.length ? queue.map(j => h('span', { class: 'slip', text: j })) : [h('span', { class: 'slip empty', text: 'no jobs' })]));
        doneEl.textContent = String(done);
        wasteEl.textContent = String(wasted);
        wasteEl.parentElement.classList.toggle('bad', wasted > 0);
      };
      paint();
      digLine.textContent = 'Fen, the digger, is looking for new chambers…';

      async function worker(i) {
        while (alive()) {
          while (queue.length === 0) {
            if (mode === 'pace') {
              wasted++;
              set(i, 'pacing blink', 'checks the board: nothing');
              paint();
              await AG.wait(120);
              if (!alive()) return;
              set(i, 'pacing', 'pacing…');
              await AG.wait(130);
            } else {
              set(i, 'asleep', 'asleep in the nursery');
              await new Promise(r => sleepers.push(r));
              if (!alive()) return;
              if (queue.length === 0) {
                wasted++;
                set(i, 'woke-for-nothing', 'woken, but the job was already taken');
                paint();
                await AG.wait(700);
              }
            }
            if (!alive()) return;
          }
          const job = queue.shift();
          paint();
          set(i, 'working', `scouting ${job}`);
          await AG.wait(2200 + rand() * 1400);
          if (!alive()) return;
          done++;
          paint();
        }
      }

      async function digger() {
        while (alive()) {
          await AG.wait(1500 + rand() * 1800);
          if (!alive()) return;
          const k = rand() < 0.3 ? 2 : 1;
          for (let j = 0; j < k; j++) {
            queue.push('/job' + nextJob++);
            if (mode === 'one') sleepers.shift()?.();
          }
          if (mode === 'all') sleepers.splice(0).forEach(r => r());
          digLine.textContent = `Fen found ${k === 1 ? 'a new chamber' : 'two new chambers'} and ${mode === 'pace' ? 'pinned the slip to the board.' : mode === 'one' ? `rang the bell ${k === 1 ? 'once' : 'twice'}: one ant per job.` : 'rang the big bell: everyone up!'}`;
          paint();
        }
      }

      for (let i = 0; i < WORKERS; i++) worker(i);
      digger();
    }

    AG.onLeave(() => gen++);
    const frame = AG.frame('The nursery',
      h('div', { class: 'toggles' }, toggles),
      h('div', { class: 'two-col', style: { marginTop: '14px' } },
        codeSlot,
        h('div', null,
          h('div', { class: 'panel' }, h('h4', { text: 'The job board' }), board, digLine),
          h('div', { class: 'counters' },
            h('div', { class: 'counter' }, doneEl, h('span', { text: 'jobs done' })),
            h('div', { class: 'counter' }, wasteEl, wasteLabel)
          )
        )
      ),
      stationWrap
    );
    start();
    return frame;
  }

  AG.chapter({
    id: 'nursery',
    title: 'The nursery',
    short: 'Busy-waiting, sleeping, and waking up: condition variables',
    checkpoints: [
      { id: 'nursery-quiz', label: 'Answer the questions about sleeping ants' },
      { id: 'nursery-code', label: 'Build the nursery' },
    ],
    build(root) {
      root.append(
        prose(`
          <p>Here is the situation chapter 7 left us in. The queue is empty. Ada is out scouting, and she may bring back new work. Bo is idle. He must not go home, because then the colony loses a worker. So what should Bo do while he waits?</p>

          <h2>Bad idea one: stare at the board</h2>
          ${code(`
while (queue.length === 0) {}   // wait until there's work
`)}
          <div class="trap">
            <p>This freezes the colony forever. Remember chapter 3: a turn is never interrupted. Bo’s loop has no <code class="aw">await</code>, so his turn never ends. Ada’s walk finishes and her continuation joins the queue of things to run, but it never gets a turn, because Bo is using the brain to stare at the board. The board will stay empty forever, because the only ant who could add work is waiting for Bo to finish.</p>
            <p>With real threads this loop “only” burns a CPU core at 100%. In JavaScript it’s worse: it stops everything.</p>
          </div>

          <h2>Bad idea two: pace up and down</h2>
          ${code(`
while (queue.length === 0) {
  await sleep(10);    // look again in 10 ms
}
`)}
          <p>This one works. The <code class="aw">await</code> ends Bo’s turn, so other ants can run. But every 10 ms Bo wakes up, uses a turn of the brain to look at the board, finds nothing, and goes back to pacing. This is called <strong>busy-waiting</strong>, or <strong>polling</strong>. It has two costs that fight each other:</p>
          <ul>
            <li><strong>Waste.</strong> Each check is brain time and battery spent learning nothing. Ten idle ants checking every 10 ms is a thousand useless turns a second.</li>
            <li><strong>Delay.</strong> When work does appear, Bo only notices at his next check, up to 10 ms later.</li>
          </ul>
          <p>Check more often and you waste more; check less often and you react more slowly. Interviewers know this trade-off well, and they ask how to avoid it.</p>

          <h2>Good idea: sleep until someone rings</h2>
          <p>Bo goes to the nursery and falls asleep. He doesn’t check anything. Whoever adds a job to the board rings a bell, and the bell wakes a sleeping ant. No checks are wasted, and nobody waits longer than they have to.</p>
          <p>Compare all three in the demo. (The pacing ants here check every 250 ms so you can watch them. Real code usually polls far more often, so the waste counter would climb far faster.)</p>
        `),
        NurseryDemo(),
        prose(`
          <p>With pacing, the waste counter climbs steadily. With “wake one per job”, it barely moves, because each job wakes exactly one ant. With “wake everyone per job”, the whole nursery jumps up for every single job, one ant gets it, and the rest trudge back to bed. That stampede is called the <strong>thundering herd</strong>.</p>

          <h2>How to sleep in JavaScript</h2>
          <p>You already have everything you need from chapter 4. A sleeping ant is an ant awaiting a promise that nobody has fulfilled yet. The nursery keeps that promise’s <code>resolve</code>, the remote control, in a list. Ringing the bell means taking a remote control off the list and pressing it.</p>
          ${code(`
// falling asleep
await new Promise(resolve => sleepers.push(resolve));

// ringing the bell for one ant
const resolve = sleepers.shift();
if (resolve) resolve();
`)}
          <p>A sleeping ant costs nothing. She isn’t in any queue the brain looks at; she’s just a function paused at an await, which only resumes when someone presses her button.</p>

          <h2>Three rules for sleeping ants</h2>
          <h3>1. Always check again after waking: <code>while</code>, never <code>if</code></h3>
          <p>Being woken doesn’t guarantee there is work. Between the bell ringing and the woken ant’s turn, another ant may have taken the job. With <code>if</code>, the ant would go ahead and <code>shift()</code> an empty queue and get <code>undefined</code>. With <code>while</code>, she checks again and goes back to sleep if there’s nothing to do.</p>
          ${code(`
while (queue.length === 0) {    // not "if"
  await nursery.sleep();
}
const url = queue.shift();      // guaranteed to be there: same turn as the check
`)}
          <h3>2. Wake one per job, and wake everyone at the end</h3>
          <p>Each new job needs one ant, so <code>wakeOne()</code>. But there is one moment when <em>everybody</em> needs to wake up: when the crawl is over. If the ant who notices “the queue is empty and <code>active</code> is 0” just goes home, the ants asleep in the nursery sleep forever. Your <code>Promise.all</code> of ants never finishes, and <code>crawl()</code> never returns. The last ant out must call <code>wakeAll()</code>, so that every sleeper wakes, sees the crawl is finished, and goes home too.</p>
          <h3>3. Never let a bell ring between checking and falling asleep</h3>
          <p>Imagine Bo checks the board (empty), and before he lies down, Ada adds a job and rings the bell. Nobody was asleep, so the bell does nothing. Then Bo falls asleep next to a job that is waiting on the board. This is a <strong>lost wake-up</strong>. In JavaScript it can’t happen, because the check and the call to <code>sleep()</code> sit in the same turn, and no bell can ring in between. With threads it can happen, which is why chapter 10’s condition variables always come with a lock.</p>

          <div class="idea">
            <p><strong>This has a name.</strong> A place where workers sleep until some condition might have become true (“there is work, or the crawl is over”), paired with a way to wake them, is a <strong>condition variable</strong>. Its operations are usually called <code>wait()</code>, <code>notify()</code> (wake one) and <code>notifyAll()</code> (wake all). When an interviewer says “use a condition variable so idle workers aren’t busy-polling”, this nursery is what they mean.</p>
          </div>
        `),
        AG.Quiz({
          id: 'nursery-quiz',
          questions: [
            {
              q: 'An idle ant waits with <code>while (queue.length === 0) {}</code> (no await). What happens in JavaScript?',
              options: ['It works, but wastes a lot of CPU', 'The whole program freezes: no other ant can ever get a turn to add work', 'JavaScript notices the loop and pauses it automatically'],
              answer: 1,
              explain: 'Right. The ant never ends her turn, so nothing else can run, including the ant who would add the work.',
              wrong: { 0: 'That’s what happens with real threads. In JavaScript it’s worse: this ant never gives up the one brain.', 2: 'JavaScript never interrupts a turn. That’s rule one from chapter 3.' },
            },
            {
              q: 'Why does a woken ant check the queue again with <code>while</code> instead of <code>if</code>?',
              options: ['Because promises sometimes fulfil twice', 'Because another ant may have taken the job between the bell and her turn', 'Because <code>if</code> doesn’t work with await'],
              answer: 1,
              explain: 'Right. Waking up only means “there might be work”. Check again, in the same turn as taking the job.',
              wrong: { 0: 'A promise fulfils at most once. The problem is what other ants do before this ant’s turn comes.', 2: '<code>if</code> works fine with await. It just doesn’t check again.' },
            },
            {
              q: 'The crawl finishes, but three ants are asleep in the nursery and nobody calls <code>wakeAll()</code>. What happens?',
              options: ['They wake up on their own after a while', 'crawl() never returns, because it is waiting for those ants to finish', 'crawl() returns, but the result is missing pages'],
              answer: 1,
              explain: 'Right. crawl() awaits every ant (with Promise.all), and three of them are paused forever.',
              wrong: { 0: 'A sleeping ant is a promise nobody will ever resolve. Nothing wakes her unless someone presses her button.', 2: 'The map is complete. The problem is that nobody ever hands it to the queen.' },
            },
          ],
        }),
        AG.Challenge({
          id: 'nursery-code',
          title: 'Build the nursery',
          brief: `
            <p>Finish the <code>Nursery</code> class, your own condition variable. <code>sleep()</code> returns a promise that stays pending until the ant is woken. <code>wakeOne()</code> wakes the ant who has been asleep longest. <code>wakeAll()</code> wakes everyone who is asleep right now.</p>
            <p>A bell that rings with nobody asleep does nothing, and it isn’t remembered for later. Ants who fall asleep afterwards stay asleep.</p>`,
          starter: `class Nursery {
  constructor() {
    this.sleepers = [];   // resolve functions of sleeping ants, oldest first
  }

  sleep() {
    // Return a promise that stays pending until someone wakes this ant.
  }

  wakeOne() {
    // Wake the ant who has been asleep longest, if there is one.
  }

  wakeAll() {
    // Wake every ant who is asleep right now.
  }
}
`,
          exports: ['Nursery'],
          hints: [
            '<code>sleep()</code> is one line: <code>return new Promise(resolve =&gt; this.sleepers.push(resolve));</code>',
            '<code>wakeOne()</code>: take the first resolve off the list with <code>shift()</code>, and call it if it exists.',
            '<code>wakeAll()</code>: grab the whole list, replace it with an empty one, and call every resolve in the old list.',
          ],
          solution: `class Nursery {
  constructor() {
    this.sleepers = [];
  }

  sleep() {
    return new Promise(resolve => this.sleepers.push(resolve));
  }

  wakeOne() {
    const resolve = this.sleepers.shift();
    if (resolve) resolve();
  }

  wakeAll() {
    const everyone = this.sleepers;
    this.sleepers = [];
    everyone.forEach(resolve => resolve());
  }
}
`,
          tests: function (test, T, U) {
            test('sleep() returns a promise that stays pending', async () => {
              const n = new U.Nursery();
              const p = n.sleep();
              T.ok(p && typeof p.then === 'function', 'sleep() should return a promise, but it returned ' + String(p) + '.');
              T.ok(await T.stillPending(p, 40), 'Nobody rang the bell, but the ant woke up anyway.');
            });
            const isPromise = p => T.ok(p && typeof p.then === 'function', 'sleep() should return a promise, but it returned ' + String(p) + '.');
            test('wakeOne() wakes exactly one ant, oldest first', async () => {
              const n = new U.Nursery();
              isPromise(n.sleep());
              n.wakeOne();
              const woke = [];
              [0, 1, 2].forEach(i => n.sleep().then(() => woke.push(i)));
              n.wakeOne();
              await T.sleep(20);
              T.ok(woke.length === 1, `wakeOne() woke ${woke.length} ants.`);
              T.ok(woke[0] === 0, `The ant who fell asleep first should wake first, but ant ${woke[0]} woke.`);
              n.wakeOne();
              await T.sleep(20);
              T.ok(woke.join() === '0,1', 'The second wakeOne() should wake the second sleeper. Woken so far: ' + woke.join(', ') + '.');
            });
            test('wakeAll() wakes every sleeping ant', async () => {
              const n = new U.Nursery();
              isPromise(n.sleep());
              n.wakeAll();
              const woke = [];
              [0, 1, 2].forEach(i => n.sleep().then(() => woke.push(i)));
              n.wakeAll();
              await T.sleep(20);
              T.ok(woke.length === 3, `wakeAll() woke ${woke.length} of 3 ants.`);
            });
            test('A bell with nobody asleep isn’t remembered', async () => {
              const n = new U.Nursery();
              n.wakeOne();
              n.wakeAll();
              const p = n.sleep();
              isPromise(p);
              T.ok(await T.stillPending(p, 40), 'The bell rang before anyone was asleep, and a later sleeper woke up from it. A wake-up only affects ants who are already asleep.');
            });
            test('Ants who fall asleep after wakeAll() stay asleep', async () => {
              const n = new U.Nursery();
              const early = n.sleep();
              isPromise(early);
              n.wakeAll();
              const late = n.sleep();
              T.ok(!(await T.stillPending(early, 20)), 'The ant asleep before wakeAll() should have woken.');
              T.ok(await T.stillPending(late, 40), 'An ant who fell asleep after wakeAll() woke up too. wakeAll() should only wake the ants asleep at that moment.');
            });
          },
          passText: 'Every test passes. You built a condition variable. You now have every piece of the crawler.',
        })
      );
    },
  });
})();
