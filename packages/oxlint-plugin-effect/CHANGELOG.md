# oxlint-plugin-effect

## 0.2.2

### Patch Changes

- [`6c0a55a`](https://github.com/cevr/effect-oxlint/commit/6c0a55a8b68c931fa2b7028f0af80a588484b0ab) Thanks [@cevr](https://github.com/cevr)! - `strict` preset: drop broken rule ref, v3-only rules, and `noAsyncFunction`. Same cleanup as `full`.

  - **Removed `noReturnNull`** — that rule name doesn't exist in the plugin (only `noReturnNullish`, which is already in strict). Previously caused oxlint to fail to parse the config when consumers used `strict`.
  - **Removed `noAsyncFunction`** — belongs in `effect-native`, not a version-agnostic strict baseline.
  - **Removed `noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`** — v3-only. Layer the `v3` preset on top when linting v3 code.

  Matches the cleanup applied to `full` in the previous release. `strict` is now a "full + style/functional + everything at error" preset with no version assumptions.

- [`d4864a7`](https://github.com/cevr/effect-oxlint/commit/d4864a7aea60f5c88761f304e32bd1115ce8d3e4) Thanks [@cevr](https://github.com/cevr)! - Split `v3` into `v3` (warn) + `v3Strict` (error) for symmetry with `full` / `strict`.

  `v3` now emits the three v3-only rules (`noCatchAllToMapError`, `noEffectGenAdapter`, `noRuntimeRunFork`) at `warn`. Pair with `core` or `full` for a gentle v3 layering. The new `v3Strict` preset fires the same rules at `error`. Pair with `strict` when you want zero tolerance:

  ```ts
  rules: { ...strict, ...v3Strict }
  ```

  Matches the `full` / `strict` severity split pattern already in the preset set.

## 0.2.1

### Patch Changes

- [`21f9e67`](https://github.com/cevr/effect-oxlint/commit/21f9e6719161c8544e425ea7340236848af63c9e) Thanks [@cevr](https://github.com/cevr)! - Publish compiled JS instead of raw TypeScript.

  Previous versions shipped `./src/*.ts` in `exports`. oxlint loads plugins through Node's ESM loader, which refuses to strip types from files under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`) — meaning the plugin was uninstallable by any consumer.

  Added a `tsdown` build and changed `exports` to point at `./dist/*.js`. The `release` script now runs the build before `changeset publish`.

- [`9fa75dc`](https://github.com/cevr/effect-oxlint/commit/9fa75dc08f4eb43642ccdf4f346c02184801484e) Thanks [@cevr](https://github.com/cevr)! - `full` preset: drop v3-only rules and `noAsyncFunction`. New `v3` preset for v3 codebases.

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

- [`a96665f`](https://github.com/cevr/effect-oxlint/commit/a96665ff028622b5a5e83bcdaee34c599e17fe59) Thanks [@cevr](https://github.com/cevr)! - `noNestedEffectCall`: uniform flattenability + data-first only.

  Two follow-up refinements for correctness and uniformity with `noNestedEffectGen`:

  1. **Data-first only.** The rule now requires the outer call to have 2+ arguments. The pipeable (data-last) form — `Effect.andThen(Effect.failCause(cause))` inside a `.pipe(...)` — is the single-arg idiomatic usage and no longer flagged. Previously false-flagged as a nested call.

  2. **Producer inners for effect-accepting combinators.** `Effect.andThen`, `Effect.tap`, `Effect.zipRight`, `Effect.zipLeft` accept an `Effect` as their second arg. A bare effect producer there (`Effect.andThen(x, Effect.sync(...))`) is a real flattenable pattern the rule previously missed. Now flagged.

  Detection table:

  | Outer                                                                | Inner                                      | Fires?                |
  | -------------------------------------------------------------------- | ------------------------------------------ | --------------------- |
  | pipeline (2 args)                                                    | pipeline                                   | yes (call tower)      |
  | `andThen`/`tap`/`zipRight`/`zipLeft` (2 args)                        | producer (`sync`, `succeed`, `fail`, etc.) | yes                   |
  | pipeline (1 arg, data-last)                                          | anything                                   | no (inside `.pipe()`) |
  | non-pipeline (`scoped`, `runPromise`, `fork*`, `ensuring`, `either`) | anything                                   | no                    |

- [`912342b`](https://github.com/cevr/effect-oxlint/commit/912342b14274a52b454e4a40010f6ccff60c8485) Thanks [@cevr](https://github.com/cevr)! - `noNestedEffectGen`: only flag directly-yielded nested gens.

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

- [`9e64bc2`](https://github.com/cevr/effect-oxlint/commit/9e64bc2c421bab5350f85aaf295fcb1470b10988) Thanks [@cevr](https://github.com/cevr)! - Tighten `noNestedEffectCall` and `noNestedEffectGen` to reduce false positives.

  **`noNestedEffectCall`** now only fires when BOTH outer and inner callees are pipeline combinators (`flatMap`, `map`, `andThen`, `tap`, `zipRight`, `catch*`, etc.). Previously fired on any `Effect.X(Effect.Y(...))`, including legitimate patterns like:

  - `Effect.ensuring(Effect.sync(...))` — finalizer argument
  - `Effect.scoped(Effect.gen(...))` — scope wrapper
  - `Effect.runPromise(Effect.gen(...))` — test boundary
  - `Effect.fork(Effect.gen(...))` — fork

  Error message now includes both operator names and a `.pipe(...)` suggestion.

  **`noNestedEffectGen`** now skips method-style gens — an `Effect.gen` that's the body of a function/arrow returned from the outer gen. This is the standard service-factory pattern:

  ```ts
  const makeFoo = Effect.gen(function* () {
    const ref = yield* Ref.make(0);
    return {
      op: () =>
        Effect.gen(function* () {
          yield* Ref.get(ref);
        }), // now allowed
    };
  });
  ```

  The inner gen closes over `ref` and can't be flattened. The rule still catches directly-nested gens like `Effect.gen(function*() { yield* Effect.gen(function*() { ... }) })`.

  Dogfooding on effect-machine dropped nested-rule false positives from 198 to 28.

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
