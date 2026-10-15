---
"oxlint-plugin-effect": minor
---

`noGlobals` follows every hop of the global object to itself: a page's `top`, `parent` and `frames`, a chain of its own names (`globalThis.window`, `window.top`), and `document.defaultView`, so `parent.fetch()` and `document.defaultView.setTimeout()` are reported. A watched global held where the walk cannot follow it (`{ w: window }`, `[document]`, `() => performance`, `mine ?? globalThis`, a `return`) is now reported as a use; handing it to a call stays allowed, since that is how an adapter is built over it. `members` takes a list of bans for one global, so its members can name different replacements, and a configured ban's `use` is named before the built-in one.

New recommended rule `noPointFreeLog`: a variadic logger (`Console.*`, `console.*`, `Effect.log*`) handed point-free to a callback that is passed an index (`Effect.forEach(lines, Console.log)`, `xs.map(console.log)`) prints the index after each line; call it in a callback, `(line) => Console.log(line)`.

New opt-in rule `noHistoryComment`: a comment says what the code does today and why, so a commit hash or "used to" said of the code is reported. `patterns` adds a project's own forms of history (pass numbers, batch or ledger ids) as regular expressions, and `history` names where the project keeps it (`git log` by default).

New opt-in rule `requireSpawnBudget`: a test (`it`, `test` and their variants from `bun:test`, `effect-bun-test`, `vitest`, `@effect/vitest` or the global) whose body spawns a process (effect's `ChildProcess.make`, Bun's `spawn`/`spawnSync`, `node:child_process`, or a function of the same file that does) names its timeout, as its last argument or `{ timeout }`. `minimum` also reports a timeout the rule reads as a number below it.
