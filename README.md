# One Brain, Many Legs

A browser game that teaches concurrency in JavaScript from first principles, played with an ant colony. It builds up to writing a concurrent web crawler: a breadth-first search run by a fixed pool of async workers, with a shared queue and seen-set, termination detection, and idle workers that sleep until woken.

## Playing

Open `index.html` in a browser. There is no build step and nothing to install. Fonts load from Google Fonts when online and fall back to system fonts otherwise.

If your browser refuses to run the code challenges from a `file://` page, serve the folder instead:

```
python3 -m http.server
```

and visit http://localhost:8000.

Progress and the code you write are saved in your browser's local storage. "Reset my progress" on the home page clears them.

## Chapters

1. The colony's mission: graphs, queues, seen-sets, BFS
2. Waiting isn't thinking: concurrency versus parallelism, JavaScript's single thread
3. The brain's to-do list: the event loop, tasks, microtasks, run-to-completion
4. Order slips: promises, async/await, Promise.all
5. Two ants, one chamber: race conditions, check-then-act, atomicity
6. The storeroom key: lost updates, critical sections, building a mutex
7. The job board: worker pools, bounded concurrency, termination detection
8. The nursery: busy-waiting versus condition variables
9. The great crawl: the concurrent crawler
10. Beyond one brain: threads, locks, atomics and condition variables, with Python versions

## How it's built

Plain HTML, CSS and JavaScript loaded as classic scripts, so the game works straight from disk.

- `js/core.js`: DOM helpers, storage, progress, syntax highlighting
- `js/graphs.js`: the colonies (test websites) used by demos and tests
- `js/farm.js`: draws a colony and animates ants on it
- `js/widgets.js`, `js/scheduler.js`, `js/eventloop.js`: quizzes, timelines, the replay, the "you are the scheduler" puzzles, and the event-loop stepper
- `js/runner.js`: runs player code and tests in a Web Worker, so a stuck loop can be stopped without freezing the page
- `js/challenge.js`: the code editor and test results
- `js/chapters/`: one file per chapter
