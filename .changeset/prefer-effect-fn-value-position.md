---
"oxlint-plugin-effect": patch
---

`preferEffectFn` reports a spanned `Effect.gen` only where a function returns it (an arrow body or a `return`). A traced generator held as a value (a variable, a property, a `yield*` operand) is no longer reported. `Effect.fn` could only name it by being invoked on the spot, which `@effect/tsgo`'s `effectFnIife` rejects.
