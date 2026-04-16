---
"oxlint-plugin-effect": patch
---

Tighten `noNestedEffectCall` and `noNestedEffectGen` to reduce false positives.

**`noNestedEffectCall`** now only fires when BOTH outer and inner callees are pipeline combinators (`flatMap`, `map`, `andThen`, `tap`, `zipRight`, `catch*`, etc.). Previously fired on any `Effect.X(Effect.Y(...))`, including legitimate patterns like:

- `Effect.ensuring(Effect.sync(...))` — finalizer argument
- `Effect.scoped(Effect.gen(...))` — scope wrapper
- `Effect.runPromise(Effect.gen(...))` — test boundary
- `Effect.fork(Effect.gen(...))` — fork

Error message now includes both operator names and a `.pipe(...)` suggestion.

**`noNestedEffectGen`** now skips method-style gens — an `Effect.gen` that's the body of a function/arrow returned from the outer gen. This is the standard service-factory pattern:

```ts
const makeFoo = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    op: () => Effect.gen(function*() { yield* Ref.get(ref) })  // now allowed
  }
})
```

The inner gen closes over `ref` and can't be flattened. The rule still catches directly-nested gens like `Effect.gen(function*() { yield* Effect.gen(function*() { ... }) })`.

Dogfooding on effect-machine dropped nested-rule false positives from 198 to 28.
