'use strict';

(function () {
  const { prose, code } = AG;

  AG.chapter({
    id: 'waiting',
    title: 'Waiting isn’t thinking',
    short: 'One brain, many legs: concurrency without parallelism',
    checkpoints: [{ id: 'waiting-quiz', label: 'Answer the questions about brains and legs' }],
    build(root) {
      root.append(
        prose(`
          <p>Your crawler from chapter 1 is correct, but in real life it would be slow. On the real web, <code>getLinks</code> doesn’t answer instantly. It has to send a request across the internet to another computer and wait for the page to come back. That takes somewhere between a few dozen and a few hundred milliseconds, for <em>every</em> page.</p>
          <p>In ant terms: getting the tunnels out of a chamber means walking all the way down there, looking around, and walking all the way back.</p>

          <h2>Walking versus thinking</h2>
          <p>Look at what an ant actually does for one chamber:</p>
          <ol>
            <li><strong>Think</strong> a little: pick the next slip, decide where to go.</li>
            <li><strong>Walk</strong>: down the tunnel and back. This is the network request.</li>
            <li><strong>Think</strong> a little again: check each tunnel against the seen-set, queue the new ones.</li>
          </ol>
          <p>The thinking is your code running, and it takes microseconds. The walking takes hundreds of milliseconds, and during the walk your code isn’t doing anything at all. It is just <em>waiting</em>. With one ant, almost all of the crawl’s time is spent waiting for one walk after another.</p>

          <h2>The colony’s strange biology</h2>
          <p>Our ants have an odd feature: <strong>the whole colony shares one brain.</strong> Only one ant can think at any moment. But walking doesn’t need the brain, so any number of ants can be walking at the same time.</p>
          <p>This is exactly how JavaScript works. Your JavaScript code runs on a single <strong>thread</strong>, a single brain, which executes one piece of your code at a time, never two. But the waiting (for the network, for timers, for files) is handled outside that brain, by the browser or by Node.js, and there can be thousands of waits going on at once.</p>
          <p>Play with the timeline below. Each row is an ant; the top row is the brain. First slide the number of ants up. Then switch to the thinking-heavy job and slide again.</p>
        `),
        AG.Timeline(),
        prose(`
          <p>With walking-heavy work, six ants finish in about a quarter of the time. Their walks overlap, and the brain only needs a sliver of time for each one. With thinking-heavy work, more ants barely help: the brain row is solid, and ants just stand around (the red hatching) waiting for their turn to think.</p>
          <div class="idea"><p><strong>Extra ants help when the work is mostly waiting.</strong> A web crawler is almost all waiting, so it is a perfect fit for one brain with many legs.</p></div>

          <h2>Two words people mix up</h2>
          <p><strong>Concurrency</strong> means several jobs are <em>in progress</em> at the same time. Their lifetimes overlap, but at any single instant only one might be actively worked on. A cook with four pots on the stove is cooking concurrently, even though they can stir only one pot at a time.</p>
          <p><strong>Parallelism</strong> means several things are <em>literally happening at the same instant</em>, which needs several workers: four cooks, four brains, four CPU cores.</p>
          <p>JavaScript gives you concurrency with one brain. Most other languages (Java, Python, Go, C++) also let a program have <em>several</em> threads, several brains, which can run in parallel. That is more power, and it brings more danger. We’ll stay with JavaScript’s one brain until chapter 10, where everything you learn carries over to the many-brains world and the interview vocabulary (mutexes, atomics, condition variables) finally shows up.</p>

          <h2>What this means for our crawler</h2>
          <p>The interview version of the crawler takes an extra argument, <code>numWorkers</code>. That is simply how many ants may be out walking at once. Our job over the next chapters is to put several ants to work on one shared queue and one shared seen-set without them tripping over each other. It turns out that’s where all the difficulty is.</p>
          ${code(`
// Where we're heading:
async function crawl(startUrl, getLinks, getHost, numWorkers) { ... }
`)}
          <p>Before that, we need to understand how the one brain decides which ant to think about next. That is chapter 3.</p>
        `),
        AG.Quiz({
          id: 'waiting-quiz',
          questions: [
            {
              q: 'In JavaScript, how many ants can be <em>thinking</em> (running your code) at the exact same moment?',
              options: ['One', 'As many as there are ants', 'One per CPU core in the computer'],
              answer: 0,
              explain: 'Right. JavaScript runs your code on a single thread: one brain. Many ants can be waiting at once, but only one is ever thinking.',
              wrong: { 1: 'Many ants can be <em>walking</em> (waiting) at once, but thinking needs the brain, and there is only one.', 2: 'That’s how many brains a multi-threaded program <em>could</em> use. A normal JavaScript program uses one.' },
            },
            {
              q: 'A crawler spends 99% of its time waiting for pages to arrive. What happens if it uses 5 ants instead of 1?',
              options: ['It gets up to about 5× faster', 'No change, because JavaScript has only one brain', 'It gets slower because the ants get in each other’s way'],
              answer: 0,
              explain: 'Right. The waits overlap, and the brain is idle 99% of the time anyway, so it has plenty of spare time to think for five ants.',
              wrong: { 1: 'One brain limits <em>thinking</em>, but this crawler barely thinks. The waiting can overlap. Try the timeline again with the walking-heavy job.', 2: 'There is a little overhead, but it is tiny compared to the waiting that now overlaps.' },
            },
            {
              q: 'A program resizes 1,000 photos, which is pure calculation with no waiting. You split the work between 5 async ants in JavaScript. What happens?',
              options: ['It gets about 5× faster', 'It takes about the same time: all the work needs the one brain', 'It can’t be split at all'],
              answer: 1,
              explain: 'Right. This is the thinking-heavy timeline: the brain is the bottleneck. To speed this up you need more brains (Web Workers, or threads in other languages).',
              wrong: { 0: 'Only if the ants could think in parallel. They can’t: they share one brain. Try the thinking-heavy job in the timeline.', 2: 'It can be split into pieces, but the pieces still take turns on one brain.' },
            },
            {
              q: 'Which sentence describes <strong>concurrency</strong> without parallelism?',
              options: [
                'Several jobs are in progress at once and take turns on one brain',
                'Several jobs run at the exact same instant on several brains',
                'Jobs run strictly one after another and never overlap',
              ],
              answer: 0,
              explain: 'Right. Overlapping lifetimes on one brain: that’s JavaScript.',
              wrong: { 1: 'That is parallelism: things truly happening at the same instant.', 2: 'That’s sequential: one job finishes before the next starts.' },
            },
          ],
        })
      );
    },
  });
})();
