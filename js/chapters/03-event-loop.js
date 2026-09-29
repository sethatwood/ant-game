'use strict';

(function () {
  const { h, prose, code } = AG;

  const SNIPPET_A = `
console.log("wake up");
setTimeout(() => console.log("timer"), 0);
Promise.resolve().then(() => console.log("promise"));
console.log("done thinking");
`;

  const SNIPPET_B = `
setTimeout(() => console.log("slow walk"), 200);
setTimeout(() => console.log("fast walk"), 50);
console.log("brain is free");
`;

  const STEPS_A = [
    { line: null, note: 'Nothing has run yet. The whole script is about to be handed to the brain as one job. Press “Next step”.' },
    { line: 1, stack: ['the script', 'console.log("wake up")'], out: ['wake up'], note: 'The brain starts the script. Line 1 calls <code>console.log</code>, which prints straight away.' },
    { line: 2, stack: ['the script', 'setTimeout(…)'], outside: ['timer: 0 ms, then log "timer"'], note: '<code>setTimeout</code> doesn’t wait. It asks the browser to start a timer and to hold on to the arrow function, a <strong>callback</strong> (“call me back when the time is up”). The brain moves on immediately.' },
    { line: 2, stack: ['the script'], outside: [], tasks: ['log "timer"'], note: '0 ms is up almost at once, so the browser puts the callback in the <strong>task queue</strong>. It can’t run yet: the brain is still busy with the script, and nothing interrupts the brain.' },
    { line: 3, stack: ['the script', 'Promise.resolve().then(…)'], micro: ['log "promise"'], note: '<code>Promise.resolve()</code> makes a promise that is already fulfilled, so <code>.then(callback)</code> schedules its callback as a <strong>microtask</strong>: an urgent note that runs as soon as the brain is free, before any task.' },
    { line: 4, stack: ['the script', 'console.log("done thinking")'], out: ['wake up', 'done thinking'], note: 'Line 4 prints. Two callbacks are waiting, but the script still has the brain.' },
    { line: null, stack: [], note: 'The script is finished. That was one complete <strong>turn</strong> of the brain. Now the event loop checks its to-do lists, and microtasks always go first.' },
    { stack: ['log "promise"'], micro: [], out: ['wake up', 'done thinking', 'promise'], note: 'The microtask runs and prints “promise”.' },
    { stack: [], note: 'The microtask queue is empty. Now the event loop takes <em>one</em> task from the task queue.' },
    { stack: ['log "timer"'], tasks: [], out: ['wake up', 'done thinking', 'promise', 'timer'], note: 'The timer callback runs at last, even though its timer was 0 ms. “0 ms” means “as soon as possible after the current turn and its microtasks”, never “right now”.' },
    { stack: [], note: 'Nothing is left anywhere. The brain sits idle until something new arrives: a click, a timer, a network response.' },
  ];

  AG.chapter({
    id: 'event-loop',
    title: 'The brain’s to-do list',
    short: 'The event loop, callbacks, and the idea of a turn',
    checkpoints: [{ id: 'loop-predict', label: 'Predict the output of both snippets' }],
    build(root) {
      const solved = new Set();
      const solvedOne = key => ok => {
        if (ok === false) return;
        solved.add(key);
        if (solved.size === 2) AG.progress.pass('loop-predict');
      };

      root.append(
        prose(`
          <p>One brain, many ants. So who decides which ant the brain thinks about next? In JavaScript that job belongs to the <strong>event loop</strong>. You don’t write it; it is built into every browser and into Node.js. But everything about concurrency in JavaScript follows from how it behaves, so it’s worth taking apart slowly.</p>

          <h2>Rule one: the brain never gets interrupted</h2>
          <p>Once the brain starts running a piece of your code, it runs it all the way to the end. Nothing can pause it in the middle to go do something else. Not a timer, not a click, not a network response, not another ant.</p>
          <p>We’ll call one uninterrupted stretch of thinking a <strong>turn</strong>. (The official name is “run to completion”.) Keep this word in mind. Almost every bug and every fix in the rest of this game comes down to what can and can’t happen inside a single turn.</p>

          <h2>Rule two: waits are handed off</h2>
          <p>If the brain can’t be interrupted, how does anything wait? It hands the waiting to someone else. When your code calls <code>setTimeout(callback, 1000)</code>, the brain doesn’t count to 1,000. It asks the browser to run a timer and says, “when it’s done, put this function on my to-do list”. Then it carries on with the next line.</p>
          <p>A function you hand over to be called later is a <strong>callback</strong>. Network requests work the same way: the browser does the waiting, out in the world, while the brain is free.</p>

          <h2>Rule three: two to-do lists</h2>
          <ul>
            <li>The <strong>task queue</strong> holds callbacks whose wait is over: timers that fired, network responses that arrived, clicks.</li>
            <li>The <strong>microtask queue</strong> holds promise follow-ups. You’ll meet promises properly in the next chapter. For now, treat microtasks as urgent notes.</li>
          </ul>
          <p>The event loop itself is simple enough to write down:</p>
          ${code(`
// What the event loop does, forever:
while (true) {
  runOneTask();          // the very first task is your whole script
  runAllMicrotasks();    // every urgent note, until none are left
  redrawThePageIfNeeded();
  waitUntilThereIsWork();
}
`)}
          <p>Before you step through it, make a prediction. What does this print, and in what order?</p>
        `),
        AG.frame('Predict, then watch',
          AG.OrderPuzzle({ code: SNIPPET_A, lines: ['wake up', 'done thinking', 'promise', 'timer'], onSolve: solvedOne('a') })
        ),
        AG.EventLoop({ title: 'Step through the event loop', code: SNIPPET_A, steps: STEPS_A }),
        prose(`
          <p>Two things surprise almost everyone here. First, “done thinking” prints before either callback, even the 0 ms timer: the script’s turn can’t be interrupted. Second, “promise” beats “timer”, because after every task the loop empties the microtask queue before it takes another task.</p>
          <p>Here’s one more to predict. Two ants set off on walks of different lengths.</p>
        `),
        AG.frame('Predict again', AG.OrderPuzzle({ code: SNIPPET_B, lines: ['brain is free', 'fast walk', 'slow walk'], onSolve: solvedOne('b') })),
        prose(`
          <p>The script’s turn runs to the end first, so “brain is free” prints immediately. After that, callbacks run in the order their waits finish, not the order they were written. The 50 ms walk comes back first.</p>
          <p>That is the essence of concurrency: <strong>the order things finish in is decided by the world, not by your code.</strong> Pages will arrive in whatever order the network delivers them.</p>

          <h2>How to freeze a colony</h2>
          <div class="trap">
            <p>Because nothing can interrupt a turn, a turn that never ends stops everything else, forever.</p>
            ${code(`
setTimeout(() => console.log("timer"), 0);

const end = Date.now() + 5000;
while (Date.now() < end) {}   // spin for five whole seconds

console.log("finally done");
`)}
            <p>For five seconds, nothing else happens: no timers, no clicks, no page redraws, no other ant gets to think. The page is frozen. Then “finally done”, and only then “timer”.</p>
            <p>Chapter 8 comes back to this. An ant that waits for work by writing <code>while (queue.length === 0) {}</code> freezes the whole colony, because the ant that would add the work never gets a turn.</p>
          </div>

          <h2>What to take with you</h2>
          <ul>
            <li>JavaScript runs your code one <strong>turn</strong> at a time, and a turn is never interrupted.</li>
            <li>Waiting is handed off to the browser. When a wait ends, its callback joins a queue and runs in a later turn.</li>
            <li>Between turns, anything that has been waiting may run, in whatever order the world decides.</li>
          </ul>
        `)
      );
    },
  });
})();
