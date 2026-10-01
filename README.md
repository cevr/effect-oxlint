# oxlint-plugin-effect

A strict, non-type-aware oxlint plugin for Effect-native TypeScript.

The package has one recommended preset. It protects application code from imperative failure handling, Promise control flow, ambient runtime dependencies, and a small set of non-idiomatic Effect APIs. Effect tsgo remains responsible for semantic and type-aware correctness.

## Install

```bash
bun add -D oxlint oxlint-plugin-effect
```

Load the plugin and enable the recommended rules in your oxlint configuration:

```ts
import { recommended } from "oxlint-plugin-effect/presets/recommended";

export default {
  jsPlugins: ["oxlint-plugin-effect/plugin"],
  rules: recommended,
};
```

A JSON configuration extends the generated preset file. It loads the plugin and enables every recommended rule, so new rules arrive with each release. It declares an empty `plugins` list, so it turns on none of oxlint's built-in plugins; the extending config's own `plugins` decide those:

```jsonc
{
  "extends": ["./node_modules/oxlint-plugin-effect/presets/recommended.json"],
  "rules": {
    // Local choices override the preset.
    "effect/noTernary": "off",
  },
}
```

Every recommended rule has `error` severity. The complexity rules carry their limit as an option, `["error", { "max": 21 }]`.

## Recommended Rules

| Rule                                   | Contract                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noAs`                          | Bans TypeScript `as` and `<T>x` assertions; use `satisfies` (`as const` and `<const>x` are allowed)                              |
| `effect/noAsyncFunction`               | Bans async functions and await expressions                                                                                       |
| `effect/noTryCatch`                    | Bans every try/catch/finally statement                                                                                           |
| `effect/noTestLifecycleHooks`          | Bans `beforeEach`, `afterEach`, `beforeAll`, and `afterAll`; use Effect scopes instead                                           |
| `effect/noThrowStatement`              | Bans every throw statement                                                                                                       |
| `effect/noNewPromise`                  | Bans new Promise, Promise calls, and Promise static APIs                                                                         |
| `effect/noPromiseChainsInTests`        | Bans `.then`, `.catch`, and `.finally` Promise chains in test files                                                              |
| `effect/noNewError`                    | Allows native Error values only as direct arguments to Effect.die, Cause.die, or Exit.die                                        |
| `effect/noNullish`                     | Bans null and undefined; permits `Object.create(null)` for prototype-free dictionaries                                           |
| `effect/noModuleMocks`                 | Bans Vitest, Jest, and bun:test module mocks, mock functions, and spies; use test layers                                         |
| `effect/noTestGlobals`                 | Bans global writes, global stubs, and implicit runner globals in test files                                                      |
| `effect/noTernary`                     | Bans conditional expressions while allowing ordinary if statements                                                               |
| `effect/noManagedRuntimeInEffect`      | Keeps ManagedRuntime construction at non-Effect host boundaries                                                                  |
| `effect/noModuleLevelMutableState`     | Bans module-level `let` and `var` outside tests; hold shared state in a Layer-owned `Ref`                                        |
| `effect/noEagerAcquire`                | Bans `acquireRelease` acquires that build or capture the resource before acquire runs                                            |
| `effect/noEffectRunInTests`            | Bans `Effect.run*`, a runtime's `run*` methods, and `ManagedRuntime.make` in tests; use `it.effect` or `it.layer`                |
| `effect/noEffectBunTestItCall`         | Bans calling effect-bun-test's `it`; it holds the runners and throws when called                                                 |
| `effect/noFixedWaitInTests`            | Bans fixed waits in tests (waited or stored sleeps, `waitForTimeout`, timer-only Promises); use `TestClock` or wait on the event |
| `effect/noInlineProvide`               | Keeps dependency provisioning at explicit composition boundaries                                                                 |
| `effect/noNestedEffectGen`             | Flattens directly yielded nested generators                                                                                      |
| `effect/noPerCallCacheConstruction`    | Constructs shared caches once in their owning layer                                                                              |
| `effect/noRunCollectOnUnboundedStream` | Requires termination before collecting a clearly unbounded Stream                                                                |
| `effect/noSequentialEffectAll`         | Uses explicit sequencing when serial aggregation discards its result                                                             |
| `effect/noSilentCatchAll`              | Keeps swallowed failures visible or recovers them truthfully                                                                     |
| `effect/noUnboundedConcurrency`        | Requires finite concurrency for collections that can grow                                                                        |
| `effect/noUnboundedRetry`              | Requires an attempt or duration bound on retry schedules                                                                         |
| `effect/noDynamicImports`              | Allows import() only behind a named lazy-loading boundary (none with `allowNamedBoundaries: false`); bans require()              |
| `effect/noEffectDo`                    | Bans Effect.Do                                                                                                                   |
| `effect/noEffectBind`                  | Bans Effect.bind                                                                                                                 |
| `effect/preferCatchTag`                | Replaces manual `_tag` predicates and `catchAll` dispatch with tagged recovery                                                   |
| `effect/preferEffectFn`                | Requires `Effect.fn` for a generator operation that adds a span                                                                  |
| `effect/preferMatchTagsExhaustive`     | Requires exhaustive `Match` for return-only `_tag` switches and if chains in Effect files                                        |
| `effect/preferPredicateIsTagged`       | Replaces combined `_tag` comparisons with a named `Predicate` refinement in Effect files                                         |
| `effect/preferSchemaTaggedUnion`       | Declares `_tag` unions of any tag case with `Schema.TaggedUnion` or `toTaggedUnion`, not hand-written type literals              |
| `effect/preferServiceOf`               | Checks inline Layer implementations through `Service.of`                                                                         |
| `effect/noAliasTestLayer`              | Bans a `Test`/`Fake`/`Stub`/`Mock` layer static that only returns the live layer                                                 |
| `effect/requireNamedEffectFn`          | Requires stable names for `Effect.fn` operations                                                                                 |
| `effect/requireSuppressionReason`      | Requires lint, Effect, and TS suppressions to name their target and give a `--` reason                                           |
| `effect/noLintEvasion`                 | Bans `undefined` and `unknown` spelled through `Option.none()` or `Schema.Unknown`                                               |
| `effect/noGlobals`                     | Bans ambient capabilities with direct Effect replacements; allows `process.std*.isTTY`; `members` bans more                      |
| `effect/noNodeBuiltinImport`           | Bans fully replaced Node modules and replaced operations from partial modules; `modules` bans more                               |

`effect/requireSuppressionReason` also rejects `@effect-diagnostics effect/name:off`: @effect/tsgo ignores the `effect/` prefix, so write the bare rule name. A blanket directive that covers its own line, such as a bare `// oxlint-disable-line` or a file-leading `/* eslint-disable */`, suppresses this rule's report too; oxlint applies the directive before the rule can report it.

## Opt-in Rules

These rules encode a project policy the preset cannot assume. The plugin registers them, and the preset leaves them off; enable each by name.

| Rule                                 | Contract                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noPlatformLayerOutsideEntry` | Provides `@effect/platform-*` layers (and the `layers` option names) only in entry files an override exempts                                |
| `effect/noPositionalLogArguments`    | Passes one message to `Effect.log*` and attaches data with `Effect.annotateLogs`                                                            |
| `effect/noRunPromise`                | Keeps `Effect.runPromise*` and runtime `runPromise` calls in boundary files an override exempts                                             |
| `effect/noTimeoutDieInTests`         | Fails a test's timeout with a typed error instead of `Effect.die`                                                                           |
| `effect/noWithWrapperCall`           | Pipes values through `withX` adapters instead of wrapping calls or callbacks; `allow` exempts names, `testFiles` narrows the test exemption |

## Test Files

Rules that treat tests differently read one definition of a test: a `*.test.*` or `*.spec.*` module. Add a project's other test code, such as helpers in a `tests/` tree or a test harness package, with the shared `effect.testFiles` setting. Each glob matches the file's path relative to the lint root; `**` crosses directories and `*` does not.

```json
{
  "settings": {
    "effect": { "testFiles": ["**/tests/**", "packages/e2e/**"] }
  }
}
```

`effect/noWithWrapperCall` lets test code keep `withX(callback)` fixture helpers. Its `testFiles` option replaces the test definition for that exemption alone: only files matching its globs keep the helpers, so shared harness code the setting counts as test code is still held to the rule.

```json
{ "rules": { "effect/noWithWrapperCall": ["error", { "testFiles": ["**/tests/**"] }] } }
```

## Anti-Slop Rules

The recommended preset also includes these rules from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop):

| Rule                                    | Contract                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `effect/noArrayFilterMap`               | Bans adjacent array `filter`/`map` passes over a known array                     |
| `effect/noChainedTypeAssertions`        | Bans nested type assertions that invent type evidence                            |
| `effect/noConditionalEmptyObjectSpread` | Bans conditional spreads that use an empty object to omit fields                 |
| `effect/noKnownValueWidening`           | Bans broad target types that discard known value evidence                        |
| `effect/noObjectParameters`             | Bans the broad `object` type on function inputs                                  |
| `effect/noReduceAccumulatorCopy`        | Bans copying a reducer accumulator on every iteration                            |
| `effect/noReflectApply`                 | Bans `Reflect.apply`; call typed functions directly                              |
| `effect/noReflectGet`                   | Bans `Reflect.get`; use typed property access                                    |
| `effect/noRuntimeTypeof`                | Requires boundary parsing instead of `typeof` narrowing; allows existence probes |
| `effect/noShapeInSymbolNames`           | Bans `shape` in symbol names                                                     |
| `effect/noUnknownParameters`            | Bans `unknown` inputs except `cause`, type guards, and rejection reasons         |
| `effect/noUnknownReturns`               | Bans return contracts of `unknown` or `Promise<unknown>`                         |
| `effect/noUnknownTypeAliases`           | Bans aliases that only hide `unknown`                                            |
| `effect/noUnsafeDictionaryType`         | Bans dictionaries with unsafe broad value types                                  |
| `effect/noWidenThenAssert`              | Bans local flows that widen known values and then assert them back               |

See `THIRD_PARTY_NOTICES.md` for the source revision and license.

The preset intentionally allows `Effect.as`, `Option.as`, `Effect.never`, `Effect.async`, simple `_tag` guards, partial or stateful `switch` statements, and runtime runners at explicit application boundaries.

## Complexity Rules

The recommended preset caps three complexity metrics for every function. Each nested function is measured as its own unit, so a heavy `Effect.gen` body is reported on the generator, not on the surrounding pipeline.

| Rule                            | Metric                                     | Limit |
| ------------------------------- | ------------------------------------------ | ----- |
| `complexity` (native oxlint)    | Cyclomatic complexity                      | 21    |
| `effect/maxCognitiveComplexity` | Cognitive complexity (SonarSource)         | 21    |
| `effect/maxHalsteadDifficulty`  | Halstead difficulty `(η1 / 2) × (N2 / η2)` | 79    |

Cognitive complexity charges one for every `if`, loop, `switch`, `catch`, and ternary, plus one for each level of nesting the structure sits in. `else` and `else if` charge one without nesting. Each run of like logical operators (`&&`, `||`, `??`) charges one, and so does a labelled `break` or `continue`.

Halstead difficulty treats every name and literal as an operand and every piece of syntax that acts on them as an operator: calls, member access, keywords, declarations, and arithmetic, logical, and assignment operators. Type annotations and type-only declarations never count.

Tighten or relax a limit per project or per file by passing a different `max`:

```json
{
  "rules": {
    "effect/maxCognitiveComplexity": ["error", { "max": 15 }],
    "effect/maxHalsteadDifficulty": ["error", { "max": 60 }]
  }
}
```

## Platform Boundaries

Application code should use Effect services for time, randomness, crypto randomness and supported digests, configuration, files, paths, child processes, stdio, HTTP, sockets, workers, streams, logging, JSON boundaries, encoding, and key-value storage.

The rules are capability-based rather than runtime-wide. They do not pretend Effect replaces HMAC, signing, encryption, password hashing, DNS, UDP, compression, module resolution, FFI, VM inspection, or every Buffer/EventEmitter/native-stream operation.

Put unmatched host calls in named adapter files and disable only the relevant rule there:

```json
{
  "overrides": [
    {
      "files": ["src/platform/**/*.ts"],
      "rules": {
        "effect/noGlobals": "off",
        "effect/noNodeBuiltinImport": "off"
      }
    }
  ]
}
```

A project that keeps a runtime behind adapters bans more with options: `noGlobals` takes `members` (a global's members, all of them or the listed `properties`), and `noNodeBuiltinImport` takes `modules` (a module, or a `*` prefix such as `bun:*`; `members` narrows the ban to those named imports and alias reads). The adapter override then turns the rules off, or configures them without the options to keep only the built-in bans:

```jsonc
{
  "rules": {
    "effect/noGlobals": [
      "error",
      {
        "members": {
          "Bun": { "use": "an Effect platform service" },
          "process": {
            "properties": ["cwd", "execPath", "pid", "platform"],
            "use": "a platform service",
          },
        },
      },
    ],
    "effect/noNodeBuiltinImport": [
      "error",
      {
        "modules": {
          "bun": { "use": "an Effect platform service" },
          "bun:*": { "use": "an Effect platform service" },
          "os": { "members": ["homedir", "hostname"], "use": "a platform service" },
        },
      },
    ],
  },
  "overrides": [
    // Only the built-in bans apply in adapters.
    {
      "files": ["src/**/*-adapter.ts"],
      "rules": { "effect/noGlobals": "error", "effect/noNodeBuiltinImport": "error" },
    },
    // A plain script may use the host directly, but not the retired members.
    {
      "files": ["scripts/**"],
      "rules": {
        "effect/noGlobals": [
          "error",
          {
            "builtins": false,
            "members": { "Bun": { "properties": ["Glob"], "use": "Effect FileSystem" } },
          },
        ],
      },
    },
  ],
}
```

`builtins: false` drops the built-in list, so only the `members` bans apply there.

## Effect tsgo Pairing

Oxlint owns unconditional syntax. Effect tsgo owns floating Effects, missing channels, nested execution, leaking requirements, strict provisioning, schema semantics, and other type-aware diagnostics.

When using both tools, disable the tsgo diagnostics duplicated by this preset:

```json
{
  "diagnosticSeverity": {
    "asyncFunction": "off",
    "cryptoRandomUUID": "off",
    "cryptoRandomUUIDInEffect": "off",
    "globalConsole": "off",
    "globalConsoleInEffect": "off",
    "globalDate": "off",
    "globalDateInEffect": "off",
    "globalFetch": "off",
    "globalFetchInEffect": "off",
    "globalRandom": "off",
    "globalRandomInEffect": "off",
    "globalTimers": "off",
    "globalTimersInEffect": "off",
    "newPromise": "off",
    "nodeBuiltinImport": "off",
    "preferSchemaOverJson": "off",
    "processEnv": "off",
    "processEnvInEffect": "off",
    "tryCatchInEffectGen": "off"
  }
}
```

Leave type-aware diagnostics such as `floatingEffect`, `runEffectInsideEffect`, `strictEffectProvide`, `extendsNativeError`, and `unsafeEffectTypeAssertion` enabled.

## Rule Authoring

The package exports Effect-first rule-authoring bindings:

```ts
import { Diagnostic, Rule, RuleContext } from "oxlint-plugin-effect/rule-bindings";

export const noThing = Rule.define({
  name: "no-thing",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid thing.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      Identifier: (node) => context.report(Diagnostic.make({ node, message: "Avoid thing." })),
    };
  },
});
```

## Development

```bash
bun install
bun run gate
bun run codegen
bun run add-rule -- no-example --dry-run
```

`bun run codegen` owns the rule export barrel and both forms of the recommended preset: `src/presets/recommended.ts` and `presets/recommended.json`.
`bun run gate` fails when either generated file is stale.

## License

MIT
