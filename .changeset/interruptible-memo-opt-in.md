---
"oxlint-plugin-effect": patch
---

`noInterruptibleMemo` leaves the recommended preset and is opt-in, and its message is now true on every effect 4.x. Effect 4.0.0 runs a cached effect in its first caller's fiber and keeps that caller's interruption for every later caller. From 4.0.1 the run is a fiber of its own: a run that every caller has left is interrupted and never cached, and the next caller starts a new one, so a run an interruption cannot stop (a promise with no signal, an engine's start) goes on beside it. The fix it names is the same for both: fork the run once into a scope that owns it and `Fiber.join` it in each caller. It no longer names `Cache`, which also gives up a lookup its callers leave. The devDependency on effect is 4.0.5, and a test holds the message to the installed release's `Effect.cached`.
