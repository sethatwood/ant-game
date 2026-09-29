'use strict';

// Runs player code and a challenge's tests inside a Web Worker, so a stuck
// loop can be stopped without freezing the page.

(function () {
  // This function is stringified and becomes the worker's source. It must not
  // refer to anything outside itself.
  function workerMain() {
    const realSetTimeout = self.setTimeout.bind(self);
    const realSetInterval = self.setInterval.bind(self);
    let timerCalls = 0;
    self.setTimeout = function (...args) {
      timerCalls++;
      return realSetTimeout(...args);
    };
    self.setInterval = function (...args) {
      timerCalls++;
      return realSetInterval(...args);
    };

    const post = m => self.postMessage(m);
    const fmt = v => {
      if (typeof v === 'string') return v;
      if (v instanceof Error) return v.name + ': ' + v.message;
      try {
        return JSON.stringify(v, (k, x) => (x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x));
      } catch {
        return String(v);
      }
    };
    let logs = 0;
    const logger = kind => (...args) => {
      logs++;
      if (logs <= 200) post({ type: 'log', kind, text: args.map(fmt).join(' ') });
      if (logs === 201) post({ type: 'log', kind: 'warn', text: '(More than 200 lines logged; the rest are hidden.)' });
    };
    console.log = logger('log');
    console.info = logger('log');
    console.warn = logger('warn');
    console.error = logger('error');

    self.addEventListener('unhandledrejection', e => {
      post({ type: 'log', kind: 'error', text: 'A promise was rejected and nothing caught it: ' + fmt(e.reason) });
    });

    const sleep = ms => new Promise(r => realSetTimeout(r, ms));
    const now = () => performance.now();
    function hash(str) {
      let x = 2166136261;
      for (let i = 0; i < str.length; i++) {
        x ^= str.charCodeAt(i);
        x = Math.imul(x, 16777619);
      }
      return x >>> 0;
    }
    const host = u => new URL(u).hostname;
    const short = u => (u.startsWith('https://anthill.org') ? u.slice(19) || '/' : u.replace('https://', ''));
    const listOf = arr => {
      const shown = arr.slice(0, 6).map(short).join(', ');
      return arr.length > 6 ? shown + ` and ${arr.length - 6} more` : shown;
    };

    class Fail extends Error {}

    const T = {
      sleep,
      now,
      short,
      listOf,
      hash,
      fail(msg) {
        throw new Fail(msg);
      },
      ok(cond, msg) {
        if (!cond) throw new Fail(msg);
      },
      timerCalls: () => timerCalls,
      getHost: host,

      // A pretend web with slow getLinks, measuring everything the player does.
      web(g, { min = 25, max = 85 } = {}) {
        const home = host(g.start);
        const stats = { calls: new Map(), active: 0, maxActive: 0, foreign: [], dupes: [], trace: [], t0: now() };
        async function getLinks(url) {
          if (typeof url !== 'string') T.fail('getLinks was called with ' + fmt(url) + ' instead of a URL string.');
          const n = (stats.calls.get(url) || 0) + 1;
          stats.calls.set(url, n);
          if (n === 2) stats.dupes.push(url);
          if (host(url) !== home) stats.foreign.push(url);
          stats.active++;
          stats.maxActive = Math.max(stats.maxActive, stats.active);
          const start = now() - stats.t0;
          const delay = g.slow[url] ?? min + (hash(url) % (max - min + 1));
          await sleep(delay);
          stats.active--;
          stats.trace.push({ url, start, end: now() - stats.t0 });
          return [...(g.pages[url] || [])];
        }
        return { getLinks, getHost: host, stats };
      },

      webSync(g) {
        const home = host(g.start);
        const stats = { calls: new Map(), foreign: [], dupes: [] };
        function getLinks(url) {
          if (typeof url !== 'string') T.fail('getLinks was called with ' + fmt(url) + ' instead of a URL string.');
          const n = (stats.calls.get(url) || 0) + 1;
          stats.calls.set(url, n);
          if (n === 2) stats.dupes.push(url);
          if (host(url) !== home) stats.foreign.push(url);
          return [...(g.pages[url] || [])];
        }
        return { getLinks, getHost: host, stats };
      },

      expected(g) {
        const home = host(g.start);
        const seen = new Set([g.start]);
        const queue = [g.start];
        while (queue.length) {
          const u = queue.shift();
          for (const v of g.pages[u] || []) {
            if (host(v) === home && !seen.has(v)) {
              seen.add(v);
              queue.push(v);
            }
          }
        }
        return [...seen];
      },

      // Checks a crawl result against the right answer, with friendly messages.
      checkResult(result, g) {
        let list;
        if (result instanceof Set) list = [...result];
        else if (Array.isArray(result)) list = result;
        else T.fail('Your function returned ' + fmt(result) + '. It should return an array (or Set) of URLs.');
        const got = new Set(list);
        if (got.size !== list.length) {
          const dup = list.filter((u, i) => list.indexOf(u) !== i);
          T.fail('Your list names some chambers more than once: ' + listOf([...new Set(dup)]) + '.');
        }
        const exp = T.expected(g);
        const expSet = new Set(exp);
        const missing = exp.filter(u => !got.has(u));
        const extra = list.filter(u => !expSet.has(u));
        if (extra.some(u => typeof u !== 'string')) T.fail('Your list contains something that is not a URL string: ' + fmt(extra.find(u => typeof u !== 'string')));
        const waspy = extra.filter(u => host(u) !== host(g.start));
        if (waspy.length) T.fail('Your list includes pages from another colony: ' + listOf(waspy) + '. Only anthill.org pages belong.');
        if (extra.length) T.fail('Your list includes ' + listOf(extra) + ', which can only be reached by going through wasp.net. Don’t follow tunnels out of the colony.');
        if (missing.length) T.fail('Missing ' + missing.length + ' of ' + exp.length + ' chambers: ' + listOf(missing) + '.');
      },

      checkStats(stats, { max } = {}) {
        if (stats.foreign.length) T.fail('You called getLinks on wasp.net pages (' + listOf(stats.foreign) + '). Check the host before scouting.');
        if (stats.dupes.length) T.fail('Some chambers were scouted more than once: ' + listOf(stats.dupes) + '. Two ants did the same work.');
        if (max != null && stats.maxActive > max) T.fail(`At one point ${stats.maxActive} ants were out at once, but you only have ${max}.`);
      },

      // Resolves to true if the promise is still unsettled after ms.
      async stillPending(p, ms = 40) {
        let settled = false;
        Promise.resolve(p).then(() => (settled = true), () => (settled = true));
        await sleep(ms);
        return !settled;
      },
    };

    self.onmessage = async e => {
      const { code, exports, tests, graphs } = e.data;
      let U;
      try {
        const tail = '\n;return {' + exports.map(n => `${JSON.stringify(n)}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ') + '};';
        U = new Function(code + tail)();
      } catch (err) {
        post({ type: 'load-error', message: fmt(err) });
        return;
      }
      for (const n of exports) {
        if (U[n] === undefined) {
          post({ type: 'load-error', message: `I couldn’t find “${n}” in your code. Keep the name the starter code uses.` });
          return;
        }
      }
      const list = [];
      const test = (name, fn, opts = {}) => list.push({ name, fn, ...opts });
      const report = {
        trace: (label, graph, trace) => post({ type: 'trace', label, graph, trace }),
      };
      try {
        new Function('test', 'T', 'U', 'G', 'report', tests)(test, T, U, graphs, report);
      } catch (err) {
        post({ type: 'load-error', message: 'The tests failed to load: ' + fmt(err) });
        return;
      }
      let hung = null;
      for (const t of list) {
        post({ type: 'start', name: t.name });
        if (hung) {
          post({ type: 'result', name: t.name, pass: false, bonus: !!t.bonus, message: `Skipped, because “${hung}” never finished. Fix that one first.` });
          continue;
        }
        try {
          const limit = t.timeout || 4000;
          let settled = false;
          await Promise.race([
            Promise.resolve().then(t.fn).finally(() => (settled = true)),
            sleep(limit).then(() => {
              if (settled) return;
              hung = t.name;
              throw new Fail(t.timeoutMessage || `This didn’t finish within ${limit / 1000} seconds. Some ant may be waiting for something that never happens.`);
            }),
          ]);
          post({ type: 'result', name: t.name, pass: true, bonus: !!t.bonus });
        } catch (err) {
          const message = err instanceof Fail ? err.message : 'Your code threw an error: ' + fmt(err);
          post({ type: 'result', name: t.name, pass: false, bonus: !!t.bonus, message });
        }
      }
      post({ type: 'done' });
    };
  }

  let workerUrl = null;
  function makeWorker() {
    if (!workerUrl) {
      const blob = new Blob(['(' + workerMain.toString() + ')();'], { type: 'text/javascript' });
      workerUrl = URL.createObjectURL(blob);
    }
    return new Worker(workerUrl);
  }

  // Returns a controller; events stream to onEvent. Resolves when finished.
  AG.runTests = function runTests({ code, exports, tests, onEvent }) {
    return new Promise(resolve => {
      let worker;
      try {
        worker = makeWorker();
      } catch (err) {
        onEvent({ type: 'load-error', message: 'This browser refused to start a Web Worker (' + err.message + '). Try opening the game through a local server: run “python3 -m http.server” in the game folder and visit http://localhost:8000.' });
        resolve();
        return;
      }
      let current = null;
      let quietTimer = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(quietTimer);
        worker.terminate();
        resolve();
      };
      const armWatchdog = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          onEvent({
            type: 'frozen',
            name: current,
            message:
              'Your code stopped responding, so I stopped it. The usual cause is a loop that never lets go of the brain, such as “while (queue.length === 0) {}” with no await inside: while it spins, no other ant can ever get a turn to add work.',
          });
          finish();
        }, 9000);
      };
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'start') current = m.name;
        armWatchdog();
        onEvent(m);
        if (m.type === 'done' || m.type === 'load-error') finish();
      };
      worker.onerror = e => {
        e.preventDefault();
        onEvent({ type: 'load-error', message: e.message || 'Your code could not be loaded.' });
        finish();
      };
      AG.onLeave(finish);
      armWatchdog();
      worker.postMessage({ code, exports, tests, graphs: AG.G });
    });
  };

  // Turns a tests function written in a chapter file into source for the worker.
  AG.testSource = fn => '(' + fn.toString() + ')(test, T, U, G, report);';
})();
