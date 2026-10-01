---
"oxlint-plugin-effect": patch
---

`noEffectRunInTests` reports a runner read through a computed key that names it: a string literal or template (`runtime["runPromise"]`) or a const bound to one (`const runPromise = "runPromise"; runtime[runPromise]`). `noTimeoutDieInTests` reads a die message through `satisfies`, `as`, `<T>`, `!` and parentheses (`Effect.die({ message: "timed out" satisfies string })`).
