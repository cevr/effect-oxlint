# oxlint-plugin-effect

## 0.2.0

### Minor Changes

- [`5ecb6fd`](https://github.com/cevr/effect-oxlint/commit/5ecb6fd543d6183d34f037c407f0a9cc0defc5e6) Thanks [@cevr](https://github.com/cevr)! - Support v3/v4 dual-version codebases and add rule-version metadata.

  **`tsgolint-effect` (Go type-aware linter):**

  - `IsEffectPackageSymbol` now matches paths across all mainstream package managers (npm/yarn-classic `node_modules/effect`, pnpm `.pnpm/effect@`, bun isolated `.bun/effect@`, yarn berry `.yarn/cache/effect-npm-`) and the `effect-v3` alias used by dual-version projects. Previously, v3 code imported as `effect-v3` silently bypassed every type-aware rule.
  - `IsEffectType`, `IsLayerType`, `IsStreamType`, `IsScopeType` now check the `~effect/*` brand property on types first, falling back to the symbol-name + path heuristic. More robust across package managers and future-proof against package-name changes.
  - Added `Rule.EffectVersion` field (`"v3" | "v4" | "both"`, default `"both"`) for version-specific rules.

  **`oxlint-plugin-effect` (JS AST linter):**

  - Added `meta.docs.effectVersion` on rules (`"v3" | "v4" | "both"`, default `"both"`). Preset authors can filter rules per project version.
  - Tagged the following rules as `"v3"` (they detect v3-only APIs): `noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`.
  - **Renamed `noRunInEffect` → `noRunInEffectGen`.** The old rule fired globally (outside Effect context too — a bug). The new rule is context-aware via `makeEffectContextTracker` and only fires inside `Effect.gen`/`Effect.fn`. Expanded coverage to `Runtime.run{Sync,Promise,Fork,Callback}`. Explicitly permits `Effect.run*With` (v4 explicit-services variants) and `<identifier>.run*` (ManagedRuntime-shaped calls) — both are legitimate at callback boundaries. Preset users must update `"effect/noRunInEffect"` references to `"effect/noRunInEffectGen"`.

## 0.1.0

### Minor Changes

- [`e1c49ed`](https://github.com/cevr/effect-oxlint/commit/e1c49ed4195de9df24c0e30196285ec29cfe5748) Thanks [@cevr](https://github.com/cevr)! - Major rule overhaul: add 16 Go type-aware rules, consolidate JS rules, enforce Effect model.

  **JS plugin (59 rules, was 66):**

  New rules:

  - noCatchAllToMapError, noUnnecessaryPipeChain, noMultipleEffectProvide
  - noSchemaUnionOfLiterals, noSchemaStructWithTag, noRedundantSchemaTagIdentifier
  - noEffectMapFlatten, noGlobalErrorInFailure, noGlobalErrorInCatch
  - noPositionalLogError (from agent session analysis — 57 violations)
  - noReturnNullish (catches null, undefined, void 0 → points to Option.none())
  - noGlobals (consolidated context rule — console, fetch, Date, Math.random, crypto, timers, JSON, process/Bun/Deno with per-API Effect alternative hints)

  Removed 14 generic global bans (no-console, no-date, no-fetch, etc.) — these belong in oxlint built-in config, not an Effect plugin. Every removed rule has an Effect-context counterpart in noGlobals.

  Restored 5 Effect-enforcing rules that prevent escaping the Effect model:

  - noThrowStatement → "Use yield* Effect.fail() or yield* new MyError()"
  - noTryCatch → "Use Effect.try / Effect.tryPromise"
  - noNewPromise → "Use Effect.async / Effect.tryPromise / Effect.promise"
  - noNewError → "Define class MyError extends Schema.TaggedErrorClass..."
  - noReturnNullish → "Use Option.none() / Effect.void"

  Redesigned Rule.banMultiple API with per-spec BanSpec discriminated union.
  Promoted high-frequency agent violations from warn to error in core/full presets.

  **Go binary (24 rules, was 8):**

  - Layer/leak detection: missingEffectContext, missingEffectError, missingLayerContext, leakingRequirements, layerMergeAllWithDependencies
  - Error hygiene: anyUnknownInError, unknownInEffectCatch
  - Code quality: effectFnOpportunity, classSelfMismatch, fnImplicitAny, scopeInLayerEffect, strictProvide, unnecessaryFailYieldable, genericServices, overriddenSchemaConstructor, nonObjectServiceType
