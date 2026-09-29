'use strict';

(function () {
  const { prose, code } = AG;

  const SOLUTION = `async function crawl(startUrl, getLinks, getHost, numWorkers) {
  const host = getHost(startUrl);
  const seen = new Set([startUrl]);
  const queue = [startUrl];
  let active = 0;
  const sleepers = [];

  const sleep = () => new Promise(resolve => sleepers.push(resolve));
  const wakeOne = () => { const r = sleepers.shift(); if (r) r(); };
  const wakeAll = () => { sleepers.splice(0).forEach(r => r()); };

  async function ant() {
    while (true) {
      // Wait for work, or for the end of the crawl.
      while (queue.length === 0) {
        if (active === 0) {        // nothing waiting, nobody busy: finished
          wakeAll();               // let the sleepers find out too
          return;                  // go home
        }
        await sleep();             // someone is busy; sleep until rung
      }

      const url = queue.shift();   // same turn as the check above
      active++;                    // same turn as the shift
      try {
        const links = await getLinks(url);   // the only door
        for (const link of links) {
          if (getHost(link) === host && !seen.has(link)) {
            seen.add(link);        // claim in the same turn as the check
            queue.push(link);
            wakeOne();             // one new job, one woken ant
          }
        }
      } finally {
        active--;                  // after the new work is on the board
      }
    }
  }

  const team = [];
  for (let i = 0; i < numWorkers; i++) team.push(ant());
  await Promise.all(team);
  return [...seen];
}
`;

  AG.chapter({
    id: 'crawl',
    title: 'The great crawl',
    short: 'Every piece together: the concurrent web crawler',
    checkpoints: [{ id: 'crawl-code', label: 'Write the concurrent crawler' }],
    build(root) {
      root.append(
        prose(`
          <p>This is the interview problem. Write:</p>
          ${code(`
async function crawl(startUrl, getLinks, getHost, numWorkers)
`)}
          <p>It should return every page on the same host as <code>startUrl</code> that can be reached from it, calling the slow <code>getLinks</code> with at most <code>numWorkers</code> calls in flight at once. It must never fetch a page twice and never leave the host, and it must return only when the crawl is truly finished. For bonus marks, idle workers should sleep instead of polling.</p>
          <p>You have built every part of this already. Here they are, with where you met them:</p>
          <ol>
            <li><strong>A queue and a seen-set, marking chambers on discovery</strong> (chapter 1).</li>
            <li><strong>Claim in the same turn as the check.</strong> No <code class="aw">await</code> between <code>seen.has</code> and <code>seen.add</code> (chapter 5).</li>
            <li><strong>A team of <code>numWorkers</code> ants</strong>, each running a loop over a shared queue, all awaited with <code>Promise.all</code> (chapter 7).</li>
            <li><strong>An <code>active</code> counter.</strong> The crawl is over when the queue is empty and <code>active</code> is 0. Increase it in the same turn as taking a job; decrease it only after the new jobs are on the board (chapter 7).</li>
            <li><strong>A nursery.</strong> Idle ants sleep; every new job wakes one; the ant who sees the end wakes everyone so they can all go home. Check again after waking with <code>while</code> (chapter 8).</li>
          </ol>

          <h2>The shape of one ant</h2>
          <p>Here is the loop in plain words. Turning it into code is your job.</p>
          <ol>
            <li>Repeat forever:</li>
            <li>While the queue is empty: if nobody is busy, the crawl is over, so wake everyone and go home. Otherwise, sleep.</li>
            <li>Take the next URL from the queue and count yourself as busy.</li>
            <li>Walk: await its links.</li>
            <li>For each link on our host with no scent mark: mark it, queue it, and wake one sleeper.</li>
            <li>Stop counting yourself as busy.</li>
          </ol>
          <p>The tests are tough. They check every colony so far, with different team sizes. They check that all four ants actually get used after a slow first tunnel (the go-home-early trap), that the result is right, that nothing is scouted twice, that no more than <code>numWorkers</code> ants are ever out at once, and that you don’t return while an ant is still walking. The bonus test checks that you never start a timer, which is how pacing ants usually give themselves away.</p>
        `),
        AG.Challenge({
          id: 'crawl-code',
          title: 'The great crawl',
          brief: `
            <p>Write the concurrent crawler. The helpers are the same as ever. <code>getLinks(url)</code> is async and slow; <code>getHost(url)</code> is instant. Return an array (or Set) of URLs in any order.</p>
            <p>When your code runs, you’ll get a replay of the big colony crawled by four ants.</p>`,
          starter: `async function crawl(startUrl, getLinks, getHost, numWorkers) {
  const host = getHost(startUrl);
  const seen = new Set([startUrl]);  // scent marks: claim on discovery
  const queue = [startUrl];          // the job board
  let active = 0;                    // ants busy with a job right now
  const sleepers = [];               // the nursery: resolve functions

  async function ant() {
    // Your worker loop goes here.
  }

  // Start numWorkers ants, and wait for all of them to go home.

  return [...seen];
}
`,
          exports: ['crawl'],
          hints: [
            'Write the three nursery helpers first, as small functions inside <code>crawl</code>: <code>sleep()</code> returns <code>new Promise(r =&gt; sleepers.push(r))</code>, <code>wakeOne()</code> shifts one resolve and calls it, and <code>wakeAll()</code> calls every resolve and empties the list.',
            'Start the team the same way as <code>runPool</code>: push <code>ant()</code> into an array <code>numWorkers</code> times, then <code>await Promise.all(team)</code>.',
            'The top of the ant’s loop: <code>while (queue.length === 0) { if (active === 0) { wakeAll(); return; } await sleep(); }</code>',
            'After that: <code>const url = queue.shift(); active++;</code>, then <code>await getLinks(url)</code>, loop over the links (check host and seen, then add, push and <code>wakeOne()</code>), and finally <code>active--</code>. Put the whole thing inside <code>while (true) { … }</code>.',
          ],
          solution: SOLUTION,
          solutionNotes: `
            <p>A few details are easy to miss:</p>
            <ul>
              <li><strong>Why is <code>wakeAll()</code> in the loop and not after <code>Promise.all</code>?</strong> <code>Promise.all</code> is waiting for the sleepers. If nobody inside wakes them, it waits forever.</li>
              <li><strong>Why doesn’t the ant who finishes the last job call <code>wakeAll()</code> right after <code>active--</code>?</strong> She doesn’t need to. She loops around, finds the queue empty and <code>active</code> at 0, and wakes everyone from there. Every woken ant then checks the same condition and goes home too.</li>
              <li><strong>Why <code>try/finally</code>?</strong> If <code>getLinks</code> throws, <code>active</code> still goes down. Without it, <code>active</code> would never reach 0 again, and every ant would sleep forever.</li>
              <li><strong>Could an ant sleep through the end?</strong> No. An ant only sleeps while <code>active &gt; 0</code>, which means some ant is busy, and that busy ant will either push work (and wake someone) or reach the end (and wake everyone).</li>
            </ul>`,
          tests: function (test, T, U, G, report) {
            const hangMessage = 'crawl() never returned. Usually this means some ants are asleep and nobody woke them at the end, or an ant is waiting for work that will never come.';
            const standard = (name, key, n, extra, opts = {}) =>
              test(name, async () => {
                const g = G[key];
                const web = T.web(g);
                const result = await U.crawl(g.start, web.getLinks, web.getHost, n);
                if (key === 'big' && n === 4) report.trace('the big colony with 4 ants', 'big', web.stats.trace);
                T.checkStats(web.stats, { max: n });
                T.checkResult(result, g);
                T.ok(web.stats.active === 0, `crawl returned while ${web.stats.active} ant${web.stats.active === 1 ? ' was' : 's were'} still out walking. The crawl isn’t over until nobody is busy.`);
                if (extra) extra(web.stats);
              }, { timeoutMessage: hangMessage, ...opts });

            standard('The tiny colony, 3 ants', 'tiny', 3);
            standard('The diamond, 3 ants', 'diamond', 3);
            standard('Wasp tunnels everywhere, 3 ants', 'wasps', 3);
            standard('A nest with a single chamber, 3 ants', 'single', 3);
            standard('The wide colony, 4 ants: all four get used', 'wide', 4, s =>
              T.ok(s.maxActive === 4, `Only ${s.maxActive} ant${s.maxActive === 1 ? ' was' : 's were'} ever out at once. There are twelve tunnels off the entrance, so all four ants should be busy.`)
            );
            standard('One long tunnel first, 4 ants: nobody goes home early', 'trap', 4, s =>
              T.ok(s.maxActive === 4, `Only ${s.maxActive} ant${s.maxActive === 1 ? ' was' : 's were'} ever out at once. After the long tunnel there are eight caves, so all four ants should be busy. Did some ants give up because the queue was empty at the very start?`)
            );
            standard('The big colony, 1 ant', 'big', 1, null, { timeout: 6000 });
            standard('The big colony, 4 ants', 'big', 4);
            test('Bonus: idle ants sleep instead of pacing', async () => {
              const g = G.trap;
              const web = T.web(g);
              const before = T.timerCalls();
              await U.crawl(g.start, web.getLinks, web.getHost, 4);
              const used = T.timerCalls() - before;
              T.ok(used === 0, `Your code started ${used} timer${used === 1 ? '' : 's'} (setTimeout or setInterval) during one crawl. Idle ants that look at the queue on a timer are busy-waiting. Put them to sleep, and wake them when work arrives.`);
            }, { bonus: true, timeoutMessage: hangMessage });
          },
          replay: true,
          replayLabel: 'the big colony with 4 ants',
          passText: 'Every test passes. That’s a correct, efficient concurrent web crawler, and you can explain every line of it.',
        }),
        prose(`
          <h2>Explaining it out loud</h2>
          <p>In an interview, the code is only half the answer. Here is the story to tell, in roughly this order:</p>
          <ol>
            <li>“It’s a breadth-first search. The seen-set stops duplicates, and I mark pages when I discover them, not when I visit them.”</li>
            <li>“Workers share the queue and the seen-set. Every check-then-act on shared state happens without a gap. In JavaScript that means no await between the check and the act; with threads it would be inside a lock.”</li>
            <li>“An empty queue doesn’t mean we’re done, because a busy worker can add more work. So I track in-flight work with a counter, and the crawl ends when the queue is empty and the counter is zero.”</li>
            <li>“Idle workers wait on a condition variable instead of polling. Each new job wakes one worker, and when the crawl ends I wake all of them so they can exit.”</li>
          </ol>

          <h2>Follow-up questions to expect</h2>
          <ul>
            <li><strong>What if <code>getLinks</code> fails?</strong> Use <code>try/finally</code> so the counter still goes down. Then decide whether to retry the page (push it back, perhaps with a retry count) or record it as failed.</li>
            <li><strong>What if two URLs point to the same page?</strong> <code>/food</code>, <code>/food/</code> and <code>/food#top</code> may all be the same page. Normalise URLs before checking the seen-set.</li>
            <li><strong>What if <code>numWorkers</code> is 1,000 but the site is tiny?</strong> Most workers sleep the whole time and wake once at the end to go home. That costs almost nothing, which is the point of sleeping instead of polling.</li>
            <li><strong>Is there another way to detect the end?</strong> Yes: count <em>outstanding</em> jobs, meaning queued plus in progress. Add one when a page is queued and subtract one when it is fully processed, and the crawl is done when the count reaches zero. Python’s <code>asyncio.Queue</code> has this built in, as you’ll see in chapter 10.</li>
            <li><strong>How would this look with real threads?</strong> That’s the last chapter.</li>
          </ul>
        `)
      );
    },
  });
})();
