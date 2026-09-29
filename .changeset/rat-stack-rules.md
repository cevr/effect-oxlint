---
"oxlint-plugin-effect": minor
---

Add ten rules to the recommended preset, all at `error`:

- `noModuleLevelMutableState` bans module-level `let` and `var` outside test files; keep request-shared state in a `Ref` owned by a Layer.
- `noEagerAcquire` bans `Effect.acquireRelease` acquires that build or capture the resource before acquire runs (`Effect.succeed(handle)`, `Effect.sync(() => capturedHandle)`).
- `noEffectRunInTests` bans `Effect.run*` and `ManagedRuntime.make` in test files; use `it.effect` or `it.layer`.
- `requireSuppressionReason` requires every oxlint, ESLint, `@effect-diagnostics`, and `@ts-*` suppression to name what it disables and give a reason after `--`, and rejects `effect/`-prefixed `@effect-diagnostics` rule names.
- From anti-slop: `noArrayFilterMap`, `noReduceAccumulatorCopy`, `noReflectApply`, `noReflectGet`, and `noUnknownReturns`.

The vendored anti-slop rules now include upstream bug fixes through `c44ef22`: lexical type alias resolution, literal-keyed `Record`s treated as closed, `unknown` detected inside unions, type-guard subjects and promise rejection reasons exempt from `noUnknownParameters`, `typeof` existence probes allowed, borrowed `shape` members allowed, type parameter constraints exempt from `noUnsafeDictionaryType`, and no semantics-changing autofix in `noConditionalEmptyObjectSpread`.
