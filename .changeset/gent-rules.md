---
"oxlint-plugin-effect": minor
---

Add rules ported from gent's lint plugin, and a shared test-file setting.

Recommended preset:

- `effect/noLintEvasion`: bans `Option.getOrUndefined(Option.none())`, `Option.getOrNull(Option.none())`, `Schema.Schema.Type<typeof Schema.Unknown>` and `typeof Schema.Unknown.Type`, the spellings of `undefined`, `null` and `unknown` that pass `noNullish` and `noUnknownParameters`.
- `effect/preferSchemaTaggedUnion`: reports a union of two or more type literals with PascalCase `_tag` literals; declare it with `Schema.TaggedUnion`.
- `effect/noEffectBunTestItCall`: reports a call of effect-bun-test's `it`, an object of runners whose call throws while the module loads.
- `effect/noPromiseChainsInTests`: reports `.then`, `.catch` and `.finally` chains in tests; calls on Effect-package bindings stay allowed.
- `effect/noAliasTestLayer`: reports a `static Test`/`Fake`/`Stub`/`Mock` (or `layerTest`) member whose whole value is the live layer.

Opt-in (registered, left out of the preset; a rule opts out with `meta.docs.recommended: false`):

- `effect/noPositionalLogArguments`: one message per `Effect.log*` call; attach data with `Effect.annotateLogs`.
- `effect/noRunPromise`: reports `Effect.runPromise*` and runtime `runPromise` calls outside the boundary files an override exempts.
- `effect/noWithWrapperCall`: pipe values through `withX` adapters instead of wrapping calls or callbacks; the `allow` option names exempt adapters.
- `effect/noTimeoutDieInTests`: reports `Effect.die` whose message describes a timeout in tests.

The shared `settings.effect.testFiles` globs add a project's own test code (a `tests/` tree, a harness package) to every test-scoped rule, `noFixedWaitInTests` included. `noDynamicImports` now also reports an inline `createRequire(import.meta.url)("x")`.
