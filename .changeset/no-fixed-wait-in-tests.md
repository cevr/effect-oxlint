---
"oxlint-plugin-effect": minor
---

Add `effect/noFixedWaitInTests`: a test file may not block on wall-clock time. It reports a waited `Effect.sleep`, `Bun.sleep`/`Bun.sleepSync`, or `setTimeout` from `timers/promises`, any `waitForTimeout(...)`, and a `new Promise` that only `setTimeout` settles. A sleep used as a value (a fake's latency, a forked fiber under `TestClock`) stays allowed. The message points to `TestClock.adjust` or waiting on the event (Deferred, Latch, Queue, `expect.poll`, `waitForFunction`).
