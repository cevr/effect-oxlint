---
"oxlint-plugin-effect": minor
---

New recommended rule `noInterruptibleMemo`: it reports `Effect.cached`, `Effect.cachedWithTTL` and `Effect.cachedInvalidateWithTTL`, data-first or as a `.pipe(...)`/`pipe(...)` operator. Each runs the memoized effect in its first caller's fiber and keeps the exit that fiber reaches, so once that caller is interrupted every later caller gets the interruption back until the TTL ends. The message names the fixes: memoize a started fiber (fork once, then `Fiber.join` in each caller) or use `Cache`, which runs each lookup in a fiber of its own. An effect whose last step is `Effect.uninterruptible`, and a TTL given as a function (it can give an interruption no lifetime), are not reported.
