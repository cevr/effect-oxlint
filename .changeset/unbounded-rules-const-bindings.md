---
"oxlint-plugin-effect": minor
---

`noUnboundedRetry` and `noUnboundedConcurrency` now follow values held in `const` bindings, through `as const`, `satisfies`, and `!`. A schedule, a retry policy, a `Schedule.take` or `Schedule.recurs` bound, an options object, or a `"unbounded"` value in a named const is checked like the inline value. Parameters and `let` bindings stay unreported.

Both rules now report the whole retry or collection call, not the schedule or `"unbounded"` value inside it. A `// oxlint-disable-next-line` comment goes above the call line, whatever the shape of its arguments. Move existing suppressions that sit inside a multi-line options object.
