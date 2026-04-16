---
"oxlint-plugin-effect": patch
---

`noNestedEffectCall`: uniform flattenability + data-first only.

Two follow-up refinements for correctness and uniformity with `noNestedEffectGen`:

1. **Data-first only.** The rule now requires the outer call to have 2+ arguments. The pipeable (data-last) form — `Effect.andThen(Effect.failCause(cause))` inside a `.pipe(...)` — is the single-arg idiomatic usage and no longer flagged. Previously false-flagged as a nested call.

2. **Producer inners for effect-accepting combinators.** `Effect.andThen`, `Effect.tap`, `Effect.zipRight`, `Effect.zipLeft` accept an `Effect` as their second arg. A bare effect producer there (`Effect.andThen(x, Effect.sync(...))`) is a real flattenable pattern the rule previously missed. Now flagged.

Detection table:

| Outer | Inner | Fires? |
|-------|-------|--------|
| pipeline (2 args) | pipeline | yes (call tower) |
| `andThen`/`tap`/`zipRight`/`zipLeft` (2 args) | producer (`sync`, `succeed`, `fail`, etc.) | yes |
| pipeline (1 arg, data-last) | anything | no (inside `.pipe()`) |
| non-pipeline (`scoped`, `runPromise`, `fork*`, `ensuring`, `either`) | anything | no |
