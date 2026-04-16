---
"oxlint-plugin-effect": patch
---

`noNestedEffectGen`: only flag directly-yielded nested gens.

Follow-up tightening. The rule now fires only when the inner `Effect.gen` is `yield*`'d straight into the outer gen body — i.e. the inner gen's value is inlined into the outer gen's statement list.

Inline gens passed as an argument to another operator are no longer flagged:

```ts
Effect.gen(function*() {
  yield* Effect.scoped(Effect.gen(function*() { ... }))      // allowed
  yield* Effect.forkDetach(Effect.gen(function*() { ... }))  // allowed
})
```

Only this shape is flagged:

```ts
Effect.gen(function*() {
  yield* Effect.gen(function*() { ... })  // still flagged — inline the body
})
```

Dogfooding on effect-machine: remaining 28 hits → 0 (all were wrapped-operator patterns).
