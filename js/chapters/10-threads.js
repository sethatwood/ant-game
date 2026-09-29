'use strict';

(function () {
  const { prose, code } = AG;

  const view = s => `
    <p>seen: ${AG.fmtSet(s.seen)}</p>
    ${'holder' in s ? `<p>Lock: ${s.holder ? 'held by ' + s.holder : 'free'}</p>` : ''}
    <p>Out walking: ${s.walking.size ? [...s.walking].join(', ') : '<em>nobody</em>'}</p>
    <p>Times /deep was scouted: <span class="${s.scouted.length > 1 ? 'bad' : ''}">${s.scouted.length}</span></p>`;

  const setup = () => ({ seen: new Set(['/', '/left', '/right']), walking: new Set(), scouted: [] });
  const goal = { text: 'get /deep scouted twice, using the code that was safe in JavaScript.', test: s => s.scouted.length >= 2 };

  const check = {
    src: 'if url in seen: return',
    run(s, me, say) {
      if (s.seen.has('/deep')) {
        say('/deep is in seen. Nothing to do.');
        return 'return';
      }
      say('/deep is not in seen.');
    },
  };
  const add = { src: 'seen.add(url)', run: (s, me, say) => { s.seen.add('/deep'); say('added /deep to seen.'); } };
  const walk = {
    src: 'links = get_links(url)',
    pause: true,
    waitText: 'blocked in get_links; can finish on her next step',
    start(s, me, say) {
      s.walking.add(me.info.name);
      say('walking to /deep.');
    },
    finish(s, me, say) {
      s.walking.delete(me.info.name);
      s.scouted.push(me.info.name);
      say('back from /deep.');
    },
  };

  const lockedCheck = {
    src: '    if url in seen: return',
    run(s, me, say) {
      if (s.seen.has('/deep')) {
        s.holder = null;
        say('/deep is in seen. Returns, and leaving the with-block releases the lock.');
        return 'return';
      }
      say('/deep is not in seen.');
    },
  };
  const acquire = {
    src: 'with lock:',
    blocked: (s, me) => s.holder && s.holder !== me.info.name,
    blockedText: 'blocked: another thread holds the lock',
    run(s, me, say) {
      s.holder = me.info.name;
      say('takes the lock.');
    },
  };
  const lockedAdd = { src: '    seen.add(url)', run: (s, me, say) => { s.seen.add('/deep'); say('added /deep to seen.'); } };
  const release = {
    src: '# end of the with-block: lock released',
    run(s, me, say) {
      s.holder = null;
      say('releases the lock.');
    },
  };

  const THREADED = `
import threading
from collections import deque

def crawl(start_url, get_links, get_host, num_workers):
    host = get_host(start_url)
    seen = {start_url}
    queue = deque([start_url])
    active = 0
    cond = threading.Condition()   # a lock and a nursery in one object

    def worker():
        nonlocal active
        while True:
            with cond:                                # take the lock
                while not queue and active > 0:
                    cond.wait()                       # sleep; the lock is released meanwhile
                if not queue:                         # empty and nobody busy: finished
                    cond.notify_all()
                    return
                url = queue.popleft()
                active += 1
            # The slow part runs WITHOUT the lock, so other threads can work.
            try:
                links = get_links(url)
            except Exception:
                links = []
            with cond:
                for link in links:
                    if get_host(link) == host and link not in seen:
                        seen.add(link)                # check and add under one lock
                        queue.append(link)
                        cond.notify()                 # wake one sleeper
                active -= 1
                if active == 0 and not queue:
                    cond.notify_all()                 # everyone, go home

    threads = [threading.Thread(target=worker) for _ in range(num_workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()                                      # like await Promise.all
    return list(seen)
`;

  const ASYNCIO = `
import asyncio

async def crawl(start_url, get_links, get_host, num_workers):
    host = get_host(start_url)
    seen = {start_url}
    queue = asyncio.Queue()
    queue.put_nowait(start_url)

    async def worker():
        while True:
            url = await queue.get()            # sleeps while the queue is empty
            try:
                for link in await get_links(url):
                    if get_host(link) == host and link not in seen:
                        seen.add(link)         # same turn as the check: safe
                        queue.put_nowait(link)
            finally:
                queue.task_done()              # this job is completely finished

    workers = [asyncio.create_task(worker()) for _ in range(num_workers)]
    await queue.join()     # waits until every queued job is task_done
    for w in workers:
        w.cancel()         # send the sleeping ants home
    return list(seen)
`;

  AG.chapter({
    id: 'threads',
    title: 'Beyond one brain',
    short: 'Threads, locks, atomics and condition variables',
    checkpoints: [
      { id: 'threads-break', label: 'Break JavaScript-safe code with threads' },
      { id: 'threads-quiz', label: 'Answer the questions about threads' },
    ],
    build(root) {
      root.append(
        prose(`
          <p>Everything so far used JavaScript’s single brain. Most other languages (Java, C++, Go, Rust, and Python) let one program run several <strong>threads</strong>: several brains, sharing the same memory, and thinking at the same time. Interview questions about concurrency are usually asked in exactly this vocabulary: threads, mutexes, atomics, interleaving, condition variables. Here is how everything you learned translates.</p>

          <h2>The one big difference</h2>
          <div class="idea">
            <p>In JavaScript, other ants can only cut in at an <code class="aw">await</code>. <strong>With threads, another thread can cut in between any two steps</strong>: between two lines, and even in the middle of one line.</p>
          </div>
          <p>So the fix from chapter 5, claiming in the same turn as the check, stops working. With threads there are no turns. Below is chapter 5’s fixed code, written in Python and run by two threads. Each button now moves a thread forward <strong>one line</strong>, because that is how fine-grained thread switching can be.</p>
        `),
        AG.Scheduler({
          title: 'Break it: the JavaScript fix, run by threads',
          mode: 'line',
          setup,
          ants: [{ lines: [check, add, walk] }, { lines: [check, add, walk] }],
          view,
          goal: { ...goal, win: '<strong>Broken.</strong> Both threads ran their check before either ran its add. In JavaScript nothing could come between those two lines; with threads, anything can.' },
          onWin: () => AG.progress.pass('threads-break'),
        }),
        prose(`
          <p>Even <code>count += 1</code> isn’t safe with threads. The processor turns it into “read count, add one, write count”, and two threads can interleave those steps to lose an update. It’s chapter 6’s vanishing seeds with no await in sight.</p>

          <h2>Locks: making your own turns</h2>
          <p>Since threads don’t get turns for free, you create them with a <strong>lock</strong> (a mutex): the storeroom key from chapter 6. Only the thread holding the lock can be inside the protected block, so a check-and-add inside it becomes atomic again. In Python that’s <code>with lock:</code>, in Java a <code>synchronized</code> block, and in Go <code>mu.Lock()</code> and <code>mu.Unlock()</code>.</p>
        `),
        AG.Scheduler({
          title: 'Try again: check and add under a lock',
          mode: 'line',
          setup: () => ({ ...setup(), holder: null }),
          ants: [{ lines: [acquire, lockedCheck, lockedAdd, release, walk] }, { lines: [acquire, lockedCheck, lockedAdd, release, walk] }],
          view,
          goal: { ...goal, text: 'get /deep scouted twice.', win: 'How did you do that? This should be impossible.' },
          why: '<p>Whichever thread takes the lock first runs its check and add while the other thread is stuck at <code>with lock:</code>. When the second thread finally gets in, /deep is already in the set. Notice that the slow <code>get_links</code> call is <em>outside</em> the lock. If you held the lock while walking, only one thread could ever be scouting, and you’d be back to one ant.</p>',
        }),
        prose(`
          <p>That last point is the bridge between the two worlds:</p>
          <div class="idea">
            <p><strong>In JavaScript, the code between two awaits is locked for free. With threads, you lock it yourself, and the <code class="aw">await</code> becomes “the slow part you do <em>outside</em> the lock”.</strong></p>
          </div>

          <h2>Atomics: one step that can’t be split</h2>
          <p>Some operations are guaranteed by the language or the hardware to be indivisible, even with threads. These are <strong>atomic operations</strong>. The useful ones for a crawler combine the check and the act into a single step that also tells you whether you won:</p>
          <ul>
            <li>Java: <code>seen.add(url)</code> on a concurrent set (from <code>ConcurrentHashMap.newKeySet()</code>) returns <code>true</code> only for the one thread that actually added it. <code>putIfAbsent</code> on a <code>ConcurrentHashMap</code> works the same way.</li>
            <li>Go: <code>sync.Map</code>’s <code>LoadOrStore</code>, or atomic <code>CompareAndSwap</code> for numbers.</li>
            <li>Counters: <code>AtomicInteger.incrementAndGet()</code> in Java, <code>atomic.AddInt64</code> in Go, <code>std::atomic&lt;int&gt;</code> in C++.</li>
          </ul>
          ${code(`
// Java: check and claim in one atomic step
if (seen.add(url)) {      // true only for the one thread that got there first
    queue.put(url);
}
`, { label: 'Java' })}
          <p>Python has no atomic “add and tell me if it was new” for sets, so in Python you use a lock.</p>
          <div class="aside"><p><strong>What about Python’s GIL?</strong> In standard CPython, a global lock means only one thread runs Python code at a time, but the interpreter can switch threads between almost any two bytecode steps. You get all the interleaving danger without the parallel speed-up for thinking-heavy code. For a crawler, which is mostly waiting, threads still help, because the waiting happens outside the GIL.</p></div>

          <h2>Condition variables: the nursery, plus a lock</h2>
          <p>Chapter 8’s nursery is a <strong>condition variable</strong>. With threads, it always comes paired with a lock, and three rules follow.</p>
          <ol>
            <li><strong>Hold the lock while you check the condition and call <code>wait()</code>.</strong> This closes chapter 8’s lost wake-up gap. No thread can add work and ring the bell between your check and your falling asleep, because adding work needs the same lock.</li>
            <li><strong><code>wait()</code> releases the lock while you sleep, and takes it back before returning.</strong> If sleeping threads held the lock, nobody could ever add work to wake them.</li>
            <li><strong>Always wait in a <code>while</code> loop.</strong> For chapter 8’s reason (someone else may have taken the job), and one more: threads can have <strong>spurious wake-ups</strong>, waking up even though nobody called notify. The loop makes them harmless.</li>
          </ol>
          <p><code>notify()</code> is <code>wakeOne()</code>, and <code>notify_all()</code> (Java: <code>notifyAll()</code> or <code>signalAll()</code>) is <code>wakeAll()</code>.</p>

          <h2>The whole dictionary</h2>
          <div class="table-wrap">
            <table class="map-table">
              <thead><tr><th>In this game</th><th>In JavaScript</th><th>With threads</th></tr></thead>
              <tbody>
                <tr><td>The brain</td><td>The one JavaScript thread</td><td>Many threads, many brains</td></tr>
                <tr><td>A turn</td><td>Code between two awaits: atomic for free</td><td>Nothing is atomic for free. A locked block is your turn</td></tr>
                <tr><td>A door</td><td><code>await</code></td><td>Every line, even the middle of a line</td></tr>
                <tr><td>Claiming a chamber</td><td><code>seen.has</code> and <code>seen.add</code> with no await between</td><td>Both inside one lock, or one atomic op like <code>putIfAbsent</code></td></tr>
                <tr><td>The storeroom key</td><td>Your <code>Mutex</code> class (rarely needed)</td><td><code>threading.Lock</code>, <code>synchronized</code>, <code>sync.Mutex</code></td></tr>
                <tr><td>The nursery</td><td>Your <code>Nursery</code>: sleep, wakeOne, wakeAll</td><td>A condition variable: wait, notify, notify_all</td></tr>
                <tr><td>Are we done?</td><td>Queue empty and <code>active === 0</code></td><td>The same, checked while holding the lock</td></tr>
                <tr><td>Waiting for the team</td><td><code>await Promise.all(team)</code></td><td><code>thread.join()</code> for each thread</td></tr>
              </tbody>
            </table>
          </div>

          <h2>The crawler with Python threads</h2>
          <p>Here is your chapter 9 crawler, translated. Read it next to your JavaScript version: the structure is the same. The differences are exactly the ones in the table. Every access to shared state is wrapped in <code>with cond:</code>, and the slow <code>get_links</code> call sits outside it.</p>
          ${code(THREADED, { python: true, label: 'Python, threads' })}

          <h2>And with Python’s asyncio</h2>
          <p>Python also has <code>asyncio</code>, which works exactly like JavaScript: one brain, <code>await</code> as the only door. If you’re allowed to use it, your JavaScript solution translates almost line for line. Its <code>asyncio.Queue</code> even has the nursery and the “are we done” counter built in: <code>get()</code> sleeps while the queue is empty, and <code>join()</code> waits until every job that was ever queued has been marked <code>task_done()</code>.</p>
          ${code(ASYNCIO, { python: true, label: 'Python, asyncio' })}

          <div class="aside"><p><strong>Real threads in JavaScript?</strong> They exist. <strong>Web Workers</strong> (and <code>worker_threads</code> in Node.js) are extra brains. Normally they share nothing and talk by sending messages, which avoids every problem in this game. If they share memory through a <code>SharedArrayBuffer</code>, you’re in the threads world, with <code>Atomics.add</code>, <code>Atomics.compareExchange</code>, and <code>Atomics.wait</code> / <code>Atomics.notify</code> (a condition-variable-style sleep and wake).</p></div>
        `),
        AG.Quiz({
          id: 'threads-quiz',
          questions: [
            {
              q: 'With Python threads, is <code>if url not in seen: seen.add(url)</code> safe without a lock?',
              options: ['Yes, it’s one line', 'No: another thread can run between the check and the add', 'Yes, because of the GIL'],
              answer: 1,
              explain: 'Right. Threads can be switched between any two steps. You broke exactly this in the first puzzle of this chapter.',
              wrong: { 0: 'One line of source can be many steps, and threads switch between steps.', 2: 'The GIL means only one thread runs at a time, but it can switch threads between the check and the add.' },
            },
            {
              q: 'Your threaded crawler holds the lock while calling the slow <code>get_links</code>. What goes wrong?',
              options: ['Nothing, it’s just extra safe', 'Pages get scouted twice', 'Only one thread can scout at a time, so the crawl is no faster than with one thread'],
              answer: 2,
              explain: 'Right. Hold locks only around the quick work on shared state. The slow part goes outside, just like the await in JavaScript.',
              wrong: { 0: 'It is safe, but every other thread waits at the lock the whole time someone is walking.', 1: 'The lock prevents duplicates. The problem is speed.' },
            },
            {
              q: 'A thread calls <code>cond.wait()</code>. What happens to the lock it was holding?',
              options: ['It keeps holding it while asleep', 'It releases it while asleep and takes it back before wait() returns', 'It releases it for good'],
              answer: 1,
              explain: 'Right. Otherwise nobody could ever take the lock to add work and wake it.',
              wrong: { 0: 'Then no other thread could take the lock to add work, and the sleeper would never be woken. That’s a deadlock.', 2: 'wait() takes the lock back before it returns, so the code after it can safely re-check the condition.' },
            },
            {
              q: 'Why is <code>cond.wait()</code> always inside a <code>while</code> loop that re-checks the condition?',
              options: ['Because of spurious wake-ups, and because another thread may have taken the work first', 'Because wait() only works inside loops', 'To make the thread wait longer'],
              answer: 0,
              explain: 'Right. Waking up means “the condition might be true now”, never “it is true”.',
              wrong: { 1: 'wait() works anywhere. The loop is there because waking up guarantees nothing.', 2: 'The loop doesn’t add waiting when the condition is true; it re-checks it.' },
            },
            {
              q: 'In JavaScript, which of these can be interrupted by another async function?',
              options: ['Any line, at any time', 'Only the points where the code awaits', 'Nothing can ever be interrupted'],
              answer: 1,
              explain: 'Right, and that is the whole difference between the two worlds.',
              wrong: { 0: 'That’s threads. JavaScript never interrupts a turn.', 2: 'Every await ends a turn, and other code runs before this function resumes.' },
            },
          ],
        }),
        prose(`
          <h2>The end of the tunnel</h2>
          <p>You started with a colony, a queue and a seen-set. Then came one brain with many legs, the event loop and its turns, promises and the doors called <code class="aw">await</code>, races and atomic turns, lost updates and keys, pools of workers, the difference between an empty queue and a finished job, and a nursery where idle ants sleep until the bell rings. That covers every idea a concurrent-crawler interview question is built on.</p>
          <p>If you want to make sure it has stuck, go back to chapter 9, press “Reset code”, and write the crawler again from memory. Then try it in Python with threads.</p>
        `)
      );
    },
  });
})();
