'use strict';

(function () {
  const { prose, code } = AG;
  const LOADS = [3, 5];

  const stockView = s => {
    const right = 10 + s.carried;
    return `
      <p>stock: <strong class="${s.stock !== right && s.doneCount === 2 ? 'bad' : ''}">${s.stock}</strong></p>
      <p>Seeds carried in so far: ${s.carried}</p>
      <p>stock should be: ${right}</p>`;
  };
  const stockSetup = () => ({ stock: 10, carried: 0, doneCount: 0 });
  const lostGoal = key => ({
    text: `make seeds vanish. Ada carries 3 and Bo carries 5, so the ${key} should end at 18.`,
    test: s => s.doneCount === 2 && (s.stock ?? s.ledger) !== 18,
  });
  const finishLine = { src: '', run: () => {} };

  function oneLineBug(i) {
    const load = LOADS[i];
    return [
      {
        src: `stock = stock + await carry(${load});`,
        pause: true,
        waitText: 'out fetching seeds; she already read stock',
        start(s, me, say) {
          me.local.read = s.stock;
          say(`reads stock (${s.stock}) first, then sets off for ${load} seeds.`);
        },
        finish(s, me, say) {
          s.stock = me.local.read + load;
          s.carried += load;
          s.doneCount++;
          say(`back. Writes stock = ${me.local.read} + ${load} = ${s.stock}.`);
        },
      },
    ];
  }

  function oneLineFixed(i) {
    const load = LOADS[i];
    return [
      {
        src: `const load = await carry(${load});`,
        pause: true,
        waitText: 'out fetching seeds',
        start: (s, me, say) => say(`sets off for ${load} seeds.`),
        finish: (s, me, say) => say(`back with ${load} seeds.`),
      },
      {
        src: 'stock = stock + load;',
        run(s, me, say) {
          const before = s.stock;
          s.stock += load;
          s.carried += load;
          s.doneCount++;
          say(`reads ${before}, writes ${s.stock}, all in one turn.`);
        },
      },
    ];
  }

  const ledgerView = s => {
    const right = 10 + s.carried;
    return `
      <p>The ledger says: <strong class="${s.ledger !== right && s.doneCount === 2 ? 'bad' : ''}">${s.ledger}</strong></p>
      <p>Seeds carried in so far: ${s.carried}</p>
      ${'holder' in s ? `<p>Key: ${s.holder ? 'held by ' + s.holder : 'on its hook'}${s.line.length ? '. Waiting in line: ' + s.line.join(', ') : ''}</p>` : ''}`;
  };

  function ledgerLines(i) {
    const load = LOADS[i];
    return [
      {
        src: 'const count = await ledger.read();',
        pause: true,
        waitText: 'waiting for the clerk to read the ledger',
        start: (s, me, say) => say('asks the clerk for the count…'),
        finish(s, me, say) {
          me.local.count = s.ledger;
          say(`the clerk says ${s.ledger}.`);
        },
      },
      {
        src: `await ledger.write(count + ${load});`,
        pause: true,
        waitText: 'waiting for the clerk to write',
        start(s, me, say) {
          me.local.val = me.local.count + load;
          say(`asks the clerk to write ${me.local.count} + ${load} = ${me.local.val}…`);
        },
        finish(s, me, say) {
          s.ledger = me.local.val;
          s.carried += load;
          s.doneCount++;
          say(`the clerk wrote ${me.local.val}.`);
        },
      },
    ];
  }

  const lockLine = {
    src: 'await key.lock();',
    pause: true,
    waitText: 'has the key; ready to go in',
    blockedText: 'waiting in line for the key',
    start(s, me, say) {
      if (!s.holder) {
        s.holder = me.info.name;
        say('takes the key from its hook.');
      } else {
        s.line.push(me.info.name);
        say(`the key is with ${s.holder}, so I wait in line.`);
      }
    },
    blocked: (s, me) => s.holder !== me.info.name,
    finish: (s, me, say) => say('has the key and goes into the storeroom.'),
  };
  const unlockLine = {
    src: 'key.unlock();',
    run(s, me, say) {
      const next = s.line.shift() || null;
      s.holder = next;
      say(next ? `hands the key straight to ${next}.` : 'hangs the key back on its hook.');
    },
  };

  AG.chapter({
    id: 'mutex',
    title: 'The storeroom key',
    short: 'Lost updates, critical sections, and building a mutex',
    checkpoints: [
      { id: 'mutex-lose', label: 'Make food vanish from the storeroom' },
      { id: 'mutex-code', label: 'Build a mutex' },
    ],
    build(root) {
      root.append(
        prose(`
          <p>Some ants carry seeds back to the storeroom, and the colony keeps a running count in a shared variable called <code>stock</code>. Each carrier walks out, fetches a load, and adds it to the count. Here is a single, innocent-looking line that does it:</p>
          ${code(`
stock = stock + await carry(3);
`)}
          <p>Only one line, and it has an <code class="aw">await</code> in it. Is it safe? JavaScript evaluates the right-hand side from left to right, so this line actually does three things, in this order:</p>
          ${code(`
const before = stock;          // 1. read stock
const load = await carry(3);   // 2. walk out and back: other ants get turns here
stock = before + load;         // 3. write, using the value read in step 1
`)}
          <p>The read happens before the door, and the write happens after it. Ada carries 3 seeds and Bo carries 5. Starting from 10, the storeroom should end up with 18.</p>
        `),
        AG.Scheduler({
          title: 'Break it: the vanishing seeds',
          setup: stockSetup,
          ants: [{ lines: oneLineBug(0) }, { lines: oneLineBug(1) }],
          view: stockView,
          goal: { ...lostGoal('stock'), win: '<strong>Seeds vanished.</strong> Both ants read the same old count before leaving. Whoever wrote second overwrote the other’s delivery with a number that never included it.' },
          onWin: () => AG.progress.pass('mutex-lose'),
        }),
        prose(`
          <h2>Lost updates</h2>
          <p>This is a <strong>lost update</strong>, the other classic race. Its pattern is <strong>read-modify-write</strong>: read a shared value, compute a new one from it, write it back. If another ant writes in between your read and your write, your write erases theirs. Nothing crashes and no error appears; the numbers are just quietly wrong.</p>
          <div class="trap"><p><code>stock += await carry(3)</code> has exactly the same bug. <code>a += b</code> is shorthand for <code>a = a + b</code>, so it reads <code>stock</code> before the await too.</p></div>
          <p>The fix follows the rule from chapter 5: do the waiting first, then read and write the shared value in the same turn, with no await in between.</p>
        `),
        AG.Scheduler({
          title: 'Try again: wait first, then update',
          setup: stockSetup,
          ants: [{ lines: oneLineFixed(0) }, { lines: oneLineFixed(1) }],
          view: stockView,
          goal: { ...lostGoal('stock'), win: 'How did you do that? This should be impossible.' },
          why: '<p>The read and the write of <code>stock</code> are now in one turn, and nothing can come between them. Whenever an ant finally updates the count, she reads the latest value and writes it back immediately.</p>',
        }),
        prose(`
          <h2>When the wait can’t move</h2>
          <p>Sometimes the waiting is <em>inside</em> the read-modify-write. Suppose the count isn’t in a variable. Instead a slow clerk beetle keeps it in a ledger, and you have to ask the clerk to read it and ask again to write it. In real programs, the clerk is a database, a file, or another server.</p>
          ${code(`
const count = await ledger.read();   // wait for the clerk
await ledger.write(count + 3);       // wait for the clerk again
`)}
          <p>Now there is an await between the read and the write, and no rearranging can get rid of it.</p>
        `),
        AG.Scheduler({
          title: 'Break it: the clerk’s ledger',
          setup: () => ({ ledger: 10, carried: 0, doneCount: 0 }),
          ants: [{ lines: ledgerLines(0) }, { lines: ledgerLines(1) }],
          view: ledgerView,
          goal: { ...lostGoal('ledger'), win: '<strong>Seeds vanished again.</strong> Both ants read 10 from the ledger before either had written. The rearranging trick can’t help here, because the read itself is a wait.' },
          onWin: () => AG.progress.pass('mutex-lose'),
        }),
        prose(`
          <h2>Critical sections and the key</h2>
          <p>The lines from “read the ledger” to “write the ledger” form a <strong>critical section</strong>: a stretch of code that must never be interleaved with another ant running the same stretch. JavaScript’s free atomicity only covers a single turn. Once a critical section contains an await, you have to protect it yourself.</p>
          <p>The tool is a <strong>lock</strong>, also called a <strong>mutex</strong> (short for <em>mutual exclusion</em>). Think of the key to the storeroom. Only the ant holding the key may go in. If the key is taken, you wait in line, and when the holder comes out, they hand the key to the next ant in line.</p>
        `),
        AG.Scheduler({
          title: 'Try again: one key for the storeroom',
          setup: () => ({ ledger: 10, carried: 0, doneCount: 0, holder: null, line: [] }),
          ants: [{ lines: [lockLine, ...ledgerLines(0), unlockLine] }, { lines: [lockLine, ...ledgerLines(1), unlockLine] }],
          view: ledgerView,
          goal: { ...lostGoal('ledger'), win: 'How did you do that? This should be impossible.' },
          why: '<p>Ants can still interleave at every await, but only the key holder can be anywhere between <code>lock()</code> and <code>unlock()</code>. The other ant is parked at <code>lock()</code> until the key is handed over. The whole critical section behaves as one indivisible step, even with awaits inside it.</p>',
        }),
        prose(`
          <h2>How a mutex works inside</h2>
          <p>A mutex in JavaScript is a small class built on the remote-control trick from chapter 4. <code>lock()</code> returns a promise. If the key is free, the promise is already fulfilled, and the ant walks straight in. If the key is taken, the ant gets a <em>pending</em> promise, and the mutex keeps that promise’s <code>resolve</code> in a waiting line. <code>unlock()</code> presses the remote control of the first ant in line, which fulfils her promise and lets her <code class="aw">await key.lock()</code> finish.</p>
          ${code(`
const key = new Mutex();

await key.lock();                // wait for the key (maybe no wait at all)
try {
  const count = await ledger.read();
  await ledger.write(count + 3);
} finally {
  key.unlock();                  // always give the key back
}
`)}
          <div class="trap">
            <p><strong>Deadlock.</strong> If an ant takes the key and never gives it back (say <code>ledger.read()</code> throws an error and the code skips <code>unlock()</code>), every other ant waits in line forever. Nothing crashes; the colony just stops. That is a <strong>deadlock</strong>. <code>try { … } finally { unlock() }</code> makes sure the key is returned even when something fails.</p>
          </div>
        `),
        AG.Challenge({
          id: 'mutex-code',
          title: 'Build the storeroom key',
          brief: `
            <p>Finish the <code>Mutex</code> class. <code>lock()</code> returns a promise that is fulfilled once the caller holds the key. <code>unlock()</code> gives the key to the next ant in line, in the order they asked, or hangs it back up if nobody is waiting.</p>
            <p>You’ll need <code>Promise.resolve()</code> (a promise that is already fulfilled) and <code>new Promise(resolve =&gt; …)</code>, keeping <code>resolve</code> for later.</p>`,
          starter: `class Mutex {
  constructor() {
    this.locked = false;   // is somebody holding the key?
    this.waiting = [];     // the resolve functions of ants waiting in line
  }

  lock() {
    // If the key is free: take it (locked = true) and return an
    //   already-fulfilled promise.
    // Otherwise: return a new Promise and push its resolve onto this.waiting.
  }

  unlock() {
    // If someone is waiting: take the first resolve off the line and call it.
    //   (The key passes straight to them, so locked stays true.)
    // Otherwise: hang the key back up (locked = false).
  }
}
`,
          exports: ['Mutex'],
          hints: [
            'In <code>lock()</code>: <code>if (!this.locked) { this.locked = true; return Promise.resolve(); }</code>',
            'Still in <code>lock()</code>, for the busy case: <code>return new Promise(resolve =&gt; this.waiting.push(resolve));</code> The ant is now parked until someone calls that <code>resolve</code>.',
            'In <code>unlock()</code>: <code>const next = this.waiting.shift();</code> If <code>next</code> exists, call <code>next()</code>. If it doesn’t, set <code>this.locked = false</code>.',
          ],
          solution: `class Mutex {
  constructor() {
    this.locked = false;
    this.waiting = [];
  }

  lock() {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  unlock() {
    const next = this.waiting.shift();
    if (next) next();            // hand the key straight over; still locked
    else this.locked = false;    // nobody waiting: back on the hook
  }
}
`,
          solutionNotes: '<p>Why hand the key over directly instead of setting <code>locked = false</code> and letting the waiting ants compete? Because between the unlock and the woken ant’s next turn, a brand-new ant could call <code>lock()</code>, find it free, and jump the line. Handing over directly keeps the line fair.</p>',
          tests: function (test, T, U) {
            test('lock() on a free mutex lets you straight in', async () => {
              const m = new U.Mutex();
              const p = m.lock();
              T.ok(p && typeof p.then === 'function', 'lock() should return a promise, but it returned ' + String(p) + '.');
              T.ok(!(await T.stillPending(p, 20)), 'Nobody held the key, but lock() never let us in.');
              m.unlock();
            });
            test('A second ant waits until the first unlocks', async () => {
              const m = new U.Mutex();
              await m.lock();
              const second = m.lock();
              T.ok(second && typeof second.then === 'function', 'lock() should always return a promise.');
              T.ok(await T.stillPending(second, 40), 'The key was held, but a second lock() got in anyway.');
              m.unlock();
              T.ok(!(await T.stillPending(second, 40)), 'The first ant unlocked, but the waiting ant never got the key.');
              m.unlock();
            });
            test('Only one of five ants is ever inside at a time', async () => {
              const m = new U.Mutex();
              let inside = 0, most = 0, done = 0;
              await Promise.all([0, 1, 2, 3, 4].map(async i => {
                await T.sleep(i * 3);
                await m.lock();
                inside++;
                most = Math.max(most, inside);
                await T.sleep(15);
                inside--;
                m.unlock();
                done++;
              }));
              T.ok(most === 1, `At one point ${most} ants were inside the storeroom together.`);
              T.ok(done === 5, 'Not every ant got a turn with the key.');
            }, { timeoutMessage: 'Some ant never got the key: she is still waiting in line. Does unlock() call the next resolve?' });
            test('The key goes out in the order ants asked for it', async () => {
              const m = new U.Mutex();
              const order = [];
              const first = m.lock();
              T.ok(first && typeof first.then === 'function', 'lock() should return a promise.');
              await first;
              const waits = [0, 1, 2, 3].map(i => m.lock().then(() => { order.push(i); m.unlock(); }));
              m.unlock();
              await Promise.all(waits);
              T.ok(order.join() === '0,1,2,3', 'The key went to the ants in this order: ' + order.join(', ') + '. It should be 0, 1, 2, 3: first come, first served.');
            }, { timeoutMessage: 'Some ant never got the key: she is still waiting in line. Does unlock() call the next resolve?' });
            test('The key works again once everyone is done', async () => {
              const m = new U.Mutex();
              const first = m.lock();
              T.ok(first && typeof first.then === 'function', 'lock() should return a promise.');
              await first;
              m.unlock();
              await m.lock();
              m.unlock();
              const p = m.lock();
              T.ok(!(await T.stillPending(p, 20)), 'Everyone had unlocked, so lock() should let the next ant straight in. Is locked set back to false when nobody is waiting?');
            });
          },
          passText: 'Every test passes. You built a mutex out of promises.',
        }),
        prose(`
          <h2>Does our crawler need one?</h2>
          <p>No, and that’s worth knowing. Everything the crawler shares (the seen-set and the queue) can be read and updated within a single turn, so JavaScript’s free atomicity is enough. In JavaScript you reach for a mutex only when a critical section has to contain an await.</p>
          <p>In languages with real threads, though, <em>every</em> line is a possible gap, so mutexes are everywhere, and interviewers will expect you to talk about them. Chapter 10 comes back to them. You now know exactly what they are for.</p>
        `)
      );
    },
  });
})();
