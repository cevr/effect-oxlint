---
"oxlint-plugin-effect": patch
---

`full` preset: drop v3-only rules and `noAsyncFunction`. New `v3` preset for v3 codebases.

**`full` preset cleanup.** `full` is meant to capture Effect-wide rules that apply regardless of version. It leaked four rules that didn't belong:

- `noAsyncFunction` — covered by `effect-native` (source comment already said so)
- `noCatchAllToMapError` — v3-only API shape
- `noEffectGenAdapter` — v3-only (v4 removed the adapter)
- `noRuntimeRunFork` — v3-only `Runtime.runFork`

On a real v4 codebase `noAsyncFunction` was responsible for 141 of 160 warnings under `full`. Removing these four rules makes `full` behave as intended: a strong Effect-only baseline without v3 assumptions or effect-native enforcement.

**New `v3` preset.** The three v3-only rules now live in a dedicated preset you layer on top of `core` / `full` / `strict` when linting a v3 project:

```jsonc
{
  "rules": {
    ...full,
    ...v3
  }
}
```

Mirrors how `functional` layers on top. No new rules, just a regrouping.
