---
"oxlint-plugin-effect": patch
---

Split `v3` into `v3` (warn) + `v3Strict` (error) for symmetry with `full` / `strict`.

`v3` now emits the three v3-only rules (`noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`) at `warn`. Pair with `core` or `full` for a gentle v3 layering. The new `v3Strict` preset fires the same rules at `error`. Pair with `strict` when you want zero tolerance:

```ts
rules: { ...strict, ...v3Strict }
```

Matches the `full` / `strict` severity split pattern already in the preset set.
