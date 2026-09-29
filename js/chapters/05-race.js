'use strict';

(function () {
  const { h, prose, code } = AG;

  const deepView = s => `
    <p>seen: ${AG.fmtSet(s.seen)}</p>
    <p>Out walking: ${s.walking.size ? [...s.walking].join(', ') : '<em>nobody</em>'}</p>
    <p>Times /deep was scouted: <span class="${s.scouted.length > 1 ? 'bad' : ''}">${s.scouted.length}</span></p>`;

  const deepSetup = () => ({ seen: new Set(['/', '/left', '/right']), walking: new Set(), scouted: [] });

  const check = {
    src: 'if (seen.has("/deep")) return;',
    run(s, me, say) {
      if (s.seen.has('/deep')) {
        say('/deep already has our scent. Nothing to do.');
        return 'return';
      }
      say('no scent on /deep, so off I go!');
    },
  };
  const walkDeep = {
    src: 'const links = await getLinks("/deep");',
    pause: true,
    waitText: 'walking to /deep; can continue when you give her a turn',
    start(s, me, say) {
      s.walking.add(me.info.name);
      say('walking to /deep. That’s an await, so my turn ends here.');
    },
    finish(s, me, say) {
      s.walking.delete(me.info.name);
      s.scouted.push(me.info.name);
      say('back from /deep with its tunnels.');
    },
  };
  const mark = { src: 'seen.add("/deep");', run: (s, me, say) => { s.seen.add('/deep'); say('marked /deep.'); } };
  const recurse = { src: 'links.forEach(explore);', run: (s, me, say) => say('sending ants into /deep’s tunnels.') };

  const goal = {
    text: 'get /deep scouted twice. That’s wasted work, and in a real crawl everything below /deep would then be crawled twice as well.',
    test: s => s.scouted.length >= 2,
  };

  function RaceBuggy() {
    return AG.Scheduler({
      title: 'Break it: two ants, one chamber',
      setup: deepSetup,
      ants: [{ lines: [check, walkDeep, mark, recurse] }, { lines: [check, walkDeep, mark, recurse] }],
      view: deepView,
      goal: {
        ...goal,
        win: '<strong>You broke it.</strong> Both ants checked the seen-set before either of them marked it. Each saw “no scent”, and each walked off to do the same job. <p>Notice what you had to do: give one ant a turn, then give the <em>other</em> ant a turn <em>while the first was still out walking</em>.</p>',
      },
      onWin: () => AG.progress.pass('race-break'),
    });
  }

  function RaceFixed() {
    return AG.Scheduler({
      title: 'Try again: claim before you walk',
      setup: deepSetup,
      ants: [{ lines: [check, mark, walkDeep, recurse] }, { lines: [check, mark, walkDeep, recurse] }],
      view: deepView,
      goal: { ...goal, win: 'How did you do that? This should be impossible.' },
      why: `
        <p>Look at where the turns end. The first <code class="aw">await</code> is the only place another ant can cut in, and both <code>seen.has</code> and <code>seen.add</code> now come <em>before</em> it, in the same turn. Whichever ant gets the first turn checks <em>and</em> marks without anyone being able to look in between. The second ant always finds the scent.</p>
        <p>There is no order of turns that breaks this. The check and the mark have become one indivisible step.</p>`,
    });
  }

  AG.chapter({
    id: 'race',
    title: 'Two ants, one chamber',
    short: 'Race conditions, check-then-act, and atomic turns',
    checkpoints: [
      { id: 'race-break', label: 'Make two ants scout the same chamber' },
      { id: 'race-code', label: 'Fix the racing crawler' },
    ],
    build(root) {
      const diamond = new AG.Farm(AG.G.diamond, { ants: 2, ariaLabel: 'The diamond colony: /left and /right both lead to /deep' });
      ['/', '/left', '/right'].forEach(p => diamond.state(AG.url(p), 'done'));
      diamond.place(diamond.ants[0], AG.url('/left'), true);
      diamond.place(diamond.ants[1], AG.url('/right'), true);

      root.append(
        prose(`
          <p>Time to put several ants to work. For this chapter, we’ll use the simplest plan possible: <strong>every time a chamber is found, send a new ant to explore it.</strong> No queue and no limit on ants. Each ant explores one chamber, then sends fresh ants down every tunnel it finds.</p>
          ${code(`
async function explore(url) {
  if (seen.has(url)) return;            // been here? stop
  const links = await getLinks(url);    // walk there and look
  seen.add(url);                        // now we've been here
  await Promise.all(links.map(explore)); // an ant for every tunnel
}
`)}
          <p>This reads naturally: “if we haven’t been here, go there, then remember that we’ve been here.” Programmers write it like this all the time. Now look at a colony shaped like a diamond, where two different tunnels lead to the same chamber.</p>
        `),
        AG.frame('A diamond-shaped colony', diamond.el),
        prose(`
          <p>Ada is scouting <code>/left</code> and Bo is scouting <code>/right</code>. At almost the same moment, both of them find a tunnel to <code>/deep</code>, and both call <code>explore("/deep")</code>.</p>
          <p>In a real program, the order in which ants get their turns depends on network timing, so it’s effectively out of your control. Here, <strong>you</strong> control it. Each button gives that ant one turn: she runs until her next <code class="aw">await</code> (or until she finishes), exactly as JavaScript would.</p>
        `),
        RaceBuggy(),
        prose(`
          <h2>What just happened</h2>
          <p>This is a <strong>race condition</strong>: a bug where the result depends on the timing of concurrent workers. Run it one way and all is well. Run it another way and the work is doubled. With a real network, you might see it once in a thousand runs, which makes race conditions some of the hardest bugs to find.</p>
          <p>This particular shape of race has its own name: <strong>check-then-act</strong>. An ant <em>checks</em> something (“is /deep marked?”), then <em>acts</em> on the answer (“mark it”), but with a gap in between. During that gap another ant checks the same thing and gets the same, now out-of-date, answer. The ants “race” to act first.</p>
          <p>Here the gap is the <code class="aw">await</code>. Ada looked at the seen-set, walked through a door, and acted on what she’d seen before she left. By the time she came back, the world had changed.</p>

          <h2>The fix: claim before you walk</h2>
          <p>Move the mark up so it happens <em>before</em> the walk. In chapter 1, you marked chambers when you discovered them, not when you visited them. This is the same rule for the same reason. Now try to break it.</p>
        `),
        RaceFixed(),
        prose(`
          <h2>Atomic</h2>
          <p>An action is <strong>atomic</strong> if nobody can ever see it half-done: from everyone else’s point of view, it either hasn’t started or it has completely finished. (The word comes from the Greek for “can’t be cut”.)</p>
          <p>In JavaScript you get atomicity for free, within a turn. Chapter 3’s rule one says a turn is never interrupted, so <strong>any code with no <code class="aw">await</code> in it is atomic</strong> as far as other ants are concerned. <code>seen.has</code> followed by <code>seen.add</code>, with no await between them, is one atomic check-and-claim.</p>
          <div class="idea">
            <p><strong>The await audit.</strong> For every <code class="aw">await</code> in your code, ask: “What did I learn before this door that I’m relying on after it?” If the answer is anything shared (a set, a counter, a queue), it may be stale when you come back. Either re-check it after the await, or finish the whole check-and-act before the await.</p>
          </div>
          <div class="aside">
            <p><strong>A preview of chapter 10.</strong> This fix works because JavaScript switches ants only at an await. With real threads, as in Java, Python or Go, other threads can cut in between <em>any</em> two lines, even between <code>has</code> and <code>add</code>. There you need a lock or a special atomic operation. The shape of the bug is identical; only the size of the gaps changes.</p>
          </div>
        `),
        AG.Challenge({
          id: 'race-code',
          title: 'Fix the racing crawler',
          brief: `
            <p>This crawler sends an ant for every tunnel, with no limit, and it has the bug you just exploited. On colonies where chambers can be reached along several paths, some chambers get scouted twice. Fix it so that no chamber is ever scouted twice.</p>
            <p>After running the tests you’ll get a replay of your crawl on the big colony: every bar is one ant’s walk.</p>`,
          starter: `async function crawl(startUrl, getLinks, getHost) {
  const host = getHost(startUrl);
  const seen = new Set();

  async function explore(url) {
    if (seen.has(url)) return;
    const links = await getLinks(url);
    seen.add(url);
    const ours = links.filter(link => getHost(link) === host);
    await Promise.all(ours.map(explore));
  }

  await explore(startUrl);
  return [...seen];
}
`,
          exports: ['crawl'],
          hints: [
            'Find the gap between checking <code>seen.has(url)</code> and doing <code>seen.add(url)</code>. What sits in between?',
            'Move <code>seen.add(url)</code> up so it runs in the same turn as the check, before the <code class="aw">await</code>.',
          ],
          solution: `async function crawl(startUrl, getLinks, getHost) {
  const host = getHost(startUrl);
  const seen = new Set();

  async function explore(url) {
    if (seen.has(url)) return;
    seen.add(url);                         // claim it in the same turn as the check
    const links = await getLinks(url);     // only then walk through the door
    const ours = links.filter(link => getHost(link) === host);
    await Promise.all(ours.map(explore));
  }

  await explore(startUrl);
  return [...seen];
}
`,
          tests: function (test, T, U, G, report) {
            const cases = [
              ['The diamond', 'diamond'],
              ['The tiny colony', 'tiny'],
              ['A wide colony with shared rooms', 'wide'],
              ['Wasp tunnels everywhere', 'wasps'],
              ['The big colony', 'big'],
            ];
            for (const [name, key] of cases) {
              test(name, async () => {
                const g = G[key];
                const web = T.web(g);
                const result = await U.crawl(g.start, web.getLinks, web.getHost);
                if (key === 'big') report.trace('the big colony', 'big', web.stats.trace);
                T.checkStats(web.stats);
                T.checkResult(result, g);
                T.ok(web.stats.active === 0, 'crawl returned while some ants were still walking. Make sure you await all the exploring before returning.');
              });
            }
          },
          replay: true,
          passText: 'Every test passes. No chamber is scouted twice, however the walks interleave.',
        }),
        prose(`
          <p>Watch the replay closely. At its busiest, a lot of ants were out at once, because this crawler sends an ant into every tunnel the moment it’s found. On a real website with ten thousand pages, that’s ten thousand requests at once. Chapter 7 fixes that with a fixed team of ants. First, though, there’s one more kind of race to meet: the one hiding inside a single line of code.</p>
        `)
      );
    },
  });
})();
