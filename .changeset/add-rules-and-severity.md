---
"oxlint-plugin-effect": minor
"tsgolint-effect": minor
---

Major rule overhaul: add 16 Go type-aware rules, consolidate JS rules, enforce Effect model.

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
