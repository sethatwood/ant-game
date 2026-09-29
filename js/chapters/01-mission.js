'use strict';

(function () {
  const { h, prose, code } = AG;

  // You play a single ant: take a slip from the queue, scout the chamber, and
  // decide what to do with every tunnel you find.
  function HandScout() {
    const g = AG.G.tiny;
    const host = AG.hostOf(g.start);
    let farm, ant, queue, seen, pending, busy, mistakes, scouted, skippedWasp, skippedSeen, finished;

    const wrap = h('div', { class: 'scout-grid' });
    const side = h('div', { class: 'scout-side' });
    const farmSlot = h('div');
    wrap.append(farmSlot, side);

    const queueList = h('ul', { class: 'slips' });
    const seenList = h('ul', { class: 'slips' });
    const choices = h('ul', { class: 'link-choices' });
    const msg = h('p', { class: 'scout-msg', 'aria-live': 'polite' });
    const actBtn = h('button', { class: 'btn', onclick: act });
    const stats = h('p', { class: 'stat-line' });
    const hereTitle = h('h4');

    side.append(
      h('div', { class: 'panel' }, h('h4', { text: 'The queue (order slips)' }), queueList),
      h('div', { class: 'panel' }, h('h4', { text: 'Scent marks (the seen-set)' }), seenList),
      h('div', { class: 'panel' }, hereTitle, choices, msg),
      actBtn,
      stats
    );

    function reset() {
      farm = new AG.Farm(g, { reveal: true, ants: 1, ariaLabel: 'The tiny colony. Chambers appear as you discover them.' });
      ant = farm.ants[0];
      farmSlot.replaceChildren(farm.el);
      queue = [g.start];
      seen = new Set([g.start]);
      pending = [];
      busy = false;
      mistakes = 0;
      scouted = 0;
      skippedWasp = 0;
      skippedSeen = 0;
      finished = false;
      farm.state(g.start, 'seen');
      msg.textContent = 'The entrance chamber is already marked and queued. Send Ada to scout it.';
      msg.className = 'scout-msg';
      paint();
    }

    function paint() {
      queueList.replaceChildren(...(queue.length ? queue.map(u => h('li', { class: 'slip', text: AG.label(u) })) : [h('li', { class: 'slip empty', text: 'empty' })]));
      seenList.replaceChildren(...[...seen].map(u => h('li', { class: 'slip', text: AG.label(u) })));
      if (finished) {
        actBtn.textContent = 'Scout the colony again';
      } else if (pending.length) {
        actBtn.textContent = 'Decide on every tunnel first';
      } else if (queue.length) {
        actBtn.textContent = `Send Ada to the next chamber in the queue (${AG.label(queue[0])})`;
      } else {
        actBtn.textContent = 'The queue is empty. Report to the queen';
      }
      actBtn.disabled = busy || (!finished && pending.some(p => !p.decided));
      stats.textContent = `Chambers scouted: ${scouted}. Wrong calls: ${mistakes}.`;
    }

    async function act() {
      if (finished) return reset();
      if (!queue.length) return report();
      const url = queue.shift();
      busy = true;
      paint();
      hereTitle.textContent = `Ada is walking to ${AG.label(url)}…`;
      choices.replaceChildren();
      msg.textContent = '';
      farm.place(ant, url);
      farm.mode(ant, 'walking');
      await AG.wait(700);
      farm.mode(ant, null);
      farm.state(url, 'active');
      farm.revealEdgesFrom(url);
      scouted++;
      const links = g.pages[url] || [];
      hereTitle.textContent = `getLinks("${AG.label(url)}") found ${links.length} tunnel${links.length === 1 ? '' : 's'}`;
      pending = links.map(link => ({ link, decided: false }));
      busy = false;
      if (!links.length) {
        msg.textContent = 'A dead end: no tunnels lead out of this chamber.';
        farm.state(url, 'done');
      } else {
        msg.textContent = 'For each tunnel, decide: mark it and queue it, or skip it.';
      }
      msg.className = 'scout-msg';
      choices.replaceChildren(...pending.map(p => choiceRow(p, url)));
      paint();
    }

    function choiceRow(p, from) {
      const verdict = h('span', { class: 'verdict' });
      const row = h('li', { class: 'link-choice' });
      const decide = wantQueue => {
        const foreign = AG.hostOf(p.link) !== host;
        const known = seen.has(p.link);
        const right = !foreign && !known;
        if (wantQueue !== right) {
          mistakes++;
          msg.className = 'scout-msg bad';
          if (foreign) msg.textContent = `${AG.label(p.link)} belongs to wasp.net. We only map our own colony, anthill.org, so skip it.`;
          else if (known) msg.textContent = `${AG.label(p.link)} already has our scent mark: it is queued or already scouted. Queuing it again would send an ant there twice. Skip it.`;
          else msg.textContent = `${AG.label(p.link)} is in our colony and has no scent mark yet. If we skip it, nobody will ever scout it. Mark it and queue it.`;
          farm.flash(p.link);
          paint();
          return;
        }
        p.decided = true;
        row.classList.add('decided');
        row.querySelectorAll('button').forEach(b => b.remove());
        if (right) {
          seen.add(p.link);
          queue.push(p.link);
          farm.state(p.link, 'seen');
          row.classList.add('queued');
          verdict.textContent = 'Marked and queued.';
        } else if (foreign) {
          skippedWasp++;
          verdict.textContent = 'Skipped: wasp colony.';
        } else {
          skippedSeen++;
          verdict.textContent = 'Skipped: already marked.';
        }
        msg.className = 'scout-msg good';
        msg.textContent = 'Right.';
        if (pending.every(q => q.decided)) {
          farm.state(from, 'done');
          pending = [];
          msg.textContent = queue.length ? 'Chamber finished. Take the next slip from the front of the queue.' : 'Chamber finished, and the queue is empty.';
        }
        paint();
      };
      row.append(
        h('code', { text: AG.label(p.link) }),
        h('button', { class: 'btn small', text: 'Mark it and queue it', onclick: () => decide(true) }),
        h('button', { class: 'btn ghost small', text: 'Skip it', onclick: () => decide(false) }),
        verdict
      );
      return row;
    }

    function report() {
      finished = true;
      farm.place(ant, 'nest');
      hereTitle.textContent = 'Report to the queen';
      choices.replaceChildren();
      msg.className = 'scout-msg good';
      msg.textContent = `Every chamber of anthill.org that can be reached from the entrance: ${[...seen].map(AG.label).join(', ')}. You skipped ${skippedWasp} wasp tunnel${skippedWasp === 1 ? '' : 's'} and ${skippedSeen} tunnel${skippedSeen === 1 ? '' : 's'} to chambers we had already marked.`;
      AG.progress.pass('mission-hand');
      paint();
    }

    reset();
    return AG.frame('Scout the colony by hand', wrap);
  }

  AG.chapter({
    id: 'mission',
    title: 'The colony’s mission',
    short: 'Chambers, tunnels, a queue and a seen-set',
    checkpoints: [
      { id: 'mission-hand', label: 'Scout the tiny colony by hand' },
      { id: 'mission-code', label: 'Write a crawler with one ant' },
    ],
    build(root) {
      root.append(
        prose(`
          <p>The queen wants a map. Specifically, she wants a list of every chamber in our colony that can be reached from the entrance. Our colony has an address, <code>anthill.org</code>, and every chamber has an address inside it, like <code>https://anthill.org/food</code>.</p>
          <p>If that sounds like a website, it is one. Chambers are <strong>pages</strong>, tunnels are <strong>links</strong>, and the colony name is the <strong>host</strong>. The queen is asking for a <strong>web crawler</strong>: start at one page, follow links, and collect every page on the same site. That is the interview problem this whole game builds toward, so the ant words and the web words will be used side by side.</p>

          <h2>Two tools</h2>
          <p>You are given two helper functions. You don’t write them; you call them.</p>
          ${code(`
getLinks("https://anthill.org/")
// → ["https://anthill.org/food", "https://anthill.org/nursery", "https://wasp.net/hive"]

getHost("https://wasp.net/hive")
// → "wasp.net"
`)}
          <p><code>getLinks(url)</code> sends an ant into a chamber. She comes back with the list of tunnels leading out of it. <code>getHost(url)</code> reads the colony name out of an address, so you can tell our chambers from the wasps’.</p>
          <p>Notice that the entrance links to <code>wasp.net/hive</code>. The neighbours’ nest is connected to ours, and the queen doesn’t care about it. Our map should include only <code>anthill.org</code> chambers.</p>

          <h2>Tunnels loop back</h2>
          <p>Chambers and tunnels form what mathematicians call a <strong>graph</strong>: things (nodes) joined by connections (edges). Our graph has loops. The food store links to the entrance, and the entrance links to the food store. An ant that simply followed every tunnel would walk in circles forever.</p>
          <p>So the colony keeps two kinds of memory:</p>
          <ul>
            <li><strong>The queue</strong>: a stack of order slips, one per chamber we know about but haven’t scouted yet. Slips are added at the back and taken from the front, like a line at a shop. First in, first out.</li>
            <li><strong>The seen-set</strong>: a scent mark on every chamber we have ever queued. Before queuing a chamber, check for our scent. If it’s there, somebody already has it covered.</li>
          </ul>
          <div class="idea"><p><strong>The rule for every tunnel you find:</strong> if it leads to another colony, skip it. If the chamber already has our scent, skip it. Otherwise, mark it with scent <em>and</em> put a slip in the queue, both at once.</p></div>
          <p>Try it yourself. You are Ada, the colony’s only scout for now. Chambers appear as you discover them.</p>
        `),
        HandScout(),
        prose(`
          <h2>What you just did has a name</h2>
          <p>You did a <strong>breadth-first search</strong>, or BFS. “Breadth-first” because the queue makes you finish everything close to the entrance before going deeper: first the entrance, then everything one tunnel away, then everything two tunnels away, and so on, level by level.</p>
          <p>Here it is as code. In JavaScript an array works as a queue: <code>push</code> adds to the back and <code>shift</code> removes from the front. A <code>Set</code> is a collection that can answer “have I seen this?” quickly with <code>has</code>, and remember something with <code>add</code>.</p>
          ${code(`
const host = getHost(startUrl);     // our colony's name: "anthill.org"
const seen = new Set([startUrl]);   // scent marks
const queue = [startUrl];           // order slips

while (queue.length > 0) {          // work left? keep going
  const url = queue.shift();        // take the slip at the front
  for (const link of getLinks(url)) {
    if (getHost(link) !== host) continue;  // another colony: skip
    if (seen.has(link)) continue;          // already marked: skip
    seen.add(link);                        // mark it...
    queue.push(link);                      // ...and queue it
  }
}
`)}
          <p>Notice when the scent mark goes on: <strong>when a chamber is discovered, not when it is visited.</strong> If we waited until an ant actually arrived to mark it, a chamber reachable by two tunnels could be queued twice before anyone got there. Keep that in mind. In chapter 5 the same mistake comes back in a much sneakier form.</p>
          <p>And notice how the loop knows it’s finished: <code>while (queue.length > 0)</code>. When the queue is empty, every chamber has been scouted. With one ant, that’s true. Remember this sentence, because in chapter 7 many ants will make it false.</p>
        `),
        AG.Challenge({
          id: 'mission-code',
          title: 'Your first crawler',
          brief: `
            <p>Write <code>crawl(startUrl, getLinks, getHost)</code>. It returns an array of every <code>anthill.org</code> URL reachable from <code>startUrl</code>, including <code>startUrl</code> itself. The order doesn’t matter.</p>
            <p>In this chapter <code>getLinks</code> answers instantly, so there is no waiting and no <code>async</code> yet. The tests check your result on five colonies, and also check that you never scout a chamber twice and never scout a wasp chamber.</p>`,
          starter: `function crawl(startUrl, getLinks, getHost) {
  const host = getHost(startUrl);
  const seen = new Set([startUrl]);  // scent marks
  const queue = [startUrl];          // order slips

  while (queue.length > 0) {
    const url = queue.shift();
    // 1. Scout the chamber: getLinks(url) gives you its links.
    // 2. For each link: skip other colonies, skip anything already seen.
    //    Otherwise mark it (seen.add) and queue it (queue.push).
  }

  return [...seen];  // turns the Set into an array
}
`,
          exports: ['crawl'],
          hints: [
            'Start the loop body with <code>const links = getLinks(url);</code> and then loop over them with <code>for (const link of links) { ... }</code>.',
            'Inside that loop, <code>if (getHost(link) !== host) continue;</code> skips wasp pages. <code>continue</code> jumps straight to the next link.',
            'After the two skip checks, call <code>seen.add(link)</code> and <code>queue.push(link)</code>.',
          ],
          solution: `function crawl(startUrl, getLinks, getHost) {
  const host = getHost(startUrl);
  const seen = new Set([startUrl]);
  const queue = [startUrl];

  while (queue.length > 0) {
    const url = queue.shift();
    for (const link of getLinks(url)) {
      if (getHost(link) !== host) continue;
      if (seen.has(link)) continue;
      seen.add(link);
      queue.push(link);
    }
  }

  return [...seen];
}
`,
          tests: function (test, T, U, G) {
            const cases = [
              ['The tiny colony', 'tiny'],
              ['A diamond: two tunnels into one chamber', 'diamond'],
              ['Wasp tunnels everywhere', 'wasps'],
              ['A nest with a single chamber', 'single'],
              ['The big colony', 'big'],
            ];
            for (const [name, key] of cases) {
              test(name, async () => {
                const g = G[key];
                const web = T.webSync(g);
                let result = U.crawl(g.start, web.getLinks, web.getHost);
                if (result && typeof result.then === 'function') result = await result;
                T.checkStats(web.stats);
                T.checkResult(result, g);
              });
            }
          },
          passText: 'Every test passes. That’s a correct crawler with one ant. Now let’s find out why one ant is painfully slow.',
        })
      );
    },
  });
})();
