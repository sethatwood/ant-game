'use strict';

// Colonies are websites. Our colony lives at anthill.org; the wasps next door
// live at wasp.net. Chambers are pages and tunnels are links.
//
// Graphs are written with short names: '/food' means https://anthill.org/food
// and 'wasp:/hive' means https://wasp.net/hive.

(function () {
  const HOME = 'https://anthill.org';
  const WASP = 'https://wasp.net';

  const url = p => (p.startsWith('wasp:') ? WASP + p.slice(5) : HOME + p);

  AG.HOME_HOST = 'anthill.org';
  AG.url = url;
  AG.label = u => (u.startsWith(HOME) ? u.slice(HOME.length) || '/' : u.replace('https://', ''));
  AG.hostOf = u => new URL(u).hostname;

  const raw = {};

  raw.tiny = {
    start: '/',
    pages: {
      '/': ['/food', '/nursery', 'wasp:/hive'],
      '/food': ['/food/seeds', '/food/aphids', '/'],
      '/nursery': ['/nursery/eggs', '/food'],
      '/food/seeds': [],
      '/food/aphids': ['/food', '/queen'],
      '/nursery/eggs': ['/queen'],
      '/queen': ['/', 'wasp:/spy'],
      'wasp:/hive': ['wasp:/stingers', '/queen'],
    },
  };

  raw.diamond = {
    start: '/',
    pages: {
      '/': ['/left', '/right'],
      '/left': ['/deep'],
      '/right': ['/deep'],
      '/deep': ['/deeper', '/'],
      '/deeper': [],
    },
  };

  // Twelve tunnels off the entrance; neighbouring tunnels share side rooms, so
  // several ants discover the same room at about the same time.
  raw.wide = { start: '/', pages: { '/': [] } };
  for (let i = 1; i <= 12; i++) {
    const t = '/t' + i;
    raw.wide.pages['/'].push(t);
    raw.wide.pages[t] = [t + '/room', '/t' + ((i % 12) + 1) + '/room'];
    raw.wide.pages[t + '/room'] = i % 3 === 0 ? ['/', t] : [];
  }

  // One slow tunnel before everything opens up. While the first ant walks it,
  // the queue is empty but the crawl is far from over.
  raw.trap = {
    start: '/',
    pages: {
      '/': ['/long-tunnel'],
      '/long-tunnel': [],
    },
    slow: { '/long-tunnel': 260 },
  };
  for (let i = 1; i <= 8; i++) {
    raw.trap.pages['/long-tunnel'].push('/cave' + i);
    raw.trap.pages['/cave' + i] = i % 2 ? ['/cave' + i + '/nook'] : ['/long-tunnel'];
    if (i % 2) raw.trap.pages['/cave' + i + '/nook'] = [];
  }

  // Wasp pages link back to an anthill page that nothing in anthill links to.
  // A crawler that follows wasp tunnels finds /secret; a correct one doesn't.
  raw.wasps = {
    start: '/',
    pages: {
      '/': ['/a', 'wasp:/w1', 'wasp:/w2'],
      '/a': ['wasp:/w2', '/b'],
      '/b': ['/', 'wasp:/w1', 'wasp:/w3'],
      'wasp:/w1': ['/secret', 'wasp:/w3'],
      'wasp:/w2': ['wasp:/w1'],
      'wasp:/w3': ['/secret'],
      '/secret': ['/'],
    },
  };

  raw.single = {
    start: '/',
    pages: { '/': ['wasp:/w1'], 'wasp:/w1': ['/'] },
  };

  // A bigger generated colony, the same every time.
  (function () {
    const rand = AG.rng(7);
    const names = ['/'];
    for (let i = 1; i < 36; i++) names.push('/r' + i);
    const pages = {};
    names.forEach(n => (pages[n] = []));
    for (let i = 1; i < names.length; i++) {
      const parent = names[Math.max(0, i - 1 - Math.floor(rand() * Math.min(i, 7)))];
      pages[parent].push(names[i]);
    }
    for (let k = 0; k < 26; k++) {
      const a = names[Math.floor(rand() * names.length)];
      const b = names[Math.floor(rand() * names.length)];
      if (a !== b && !pages[a].includes(b)) pages[a].push(b);
    }
    for (let k = 0; k < 8; k++) {
      const a = names[Math.floor(rand() * names.length)];
      pages[a].push('wasp:/w' + k);
    }
    raw.big = { start: '/', pages };
  })();

  raw.pool = { start: '/', pages: { '/': [] } };
  for (let i = 1; i <= 8; i++) {
    raw.pool.pages['/'].push('/job' + i);
    raw.pool.pages['/job' + i] = [];
  }

  function expand(g) {
    const pages = {};
    for (const [k, links] of Object.entries(g.pages)) pages[url(k)] = links.map(url);
    const slow = {};
    for (const [k, ms] of Object.entries(g.slow || {})) slow[url(k)] = ms;
    return { start: url(g.start), pages, slow };
  }

  AG.G = {};
  for (const [name, g] of Object.entries(raw)) AG.G[name] = expand(g);

  // The right answer for a graph: every home-colony page reachable from the
  // start without ever stepping through a wasp page.
  AG.expected = function expected(g) {
    const host = AG.hostOf(g.start);
    const seen = new Set([g.start]);
    const queue = [g.start];
    while (queue.length) {
      const u = queue.shift();
      for (const v of g.pages[u] || []) {
        if (AG.hostOf(v) === host && !seen.has(v)) {
          seen.add(v);
          queue.push(v);
        }
      }
    }
    return [...seen];
  };
})();
