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

If the project uses JSON configuration, copy the exported rule map into `rules`; every recommended rule has `error` severity. The complexity rules carry their limit as an option, `["error", { "max": 21 }]`.

## Recommended Rules

| Rule                                   | Contract                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `effect/noAs`                          | Bans TypeScript `as` assertions; use `satisfies`                                          |
| `effect/noAsyncFunction`               | Bans async functions and await expressions                                                |
| `effect/noTryCatch`                    | Bans every try/catch/finally statement                                                    |
| `effect/noTestLifecycleHooks`          | Bans `beforeEach`, `afterEach`, `beforeAll`, and `afterAll`; use Effect scopes instead    |
| `effect/noThrowStatement`              | Bans every throw statement                                                                |
| `effect/noNewPromise`                  | Bans new Promise, Promise calls, and Promise static APIs                                  |
| `effect/noNewError`                    | Allows native Error values only as direct arguments to Effect.die, Cause.die, or Exit.die |
| `effect/noNullish`                     | Bans null and undefined; use Option or a domain enum for richer state                     |
| `effect/noModuleMocks`                 | Bans Vitest and Jest module mocks and method spies; use Effect service test layers        |
| `effect/noTernary`                     | Bans conditional expressions while allowing ordinary if statements                        |
| `effect/noManagedRuntimeInEffect`      | Keeps ManagedRuntime construction at non-Effect host boundaries                           |
| `effect/noInlineProvide`               | Keeps dependency provisioning at explicit composition boundaries                          |
| `effect/noNestedEffectGen`             | Flattens directly yielded nested generators                                               |
| `effect/noPerCallCacheConstruction`    | Constructs shared caches once in their owning layer                                       |
| `effect/noRunCollectOnUnboundedStream` | Requires termination before collecting a clearly unbounded Stream                         |
| `effect/noSequentialEffectAll`         | Uses explicit sequencing when serial aggregation discards its result                      |
| `effect/noSilentCatchAll`              | Keeps swallowed failures visible or recovers them truthfully                              |
| `effect/noUnboundedConcurrency`        | Requires finite concurrency for collections that can grow                                 |
| `effect/noUnboundedRetry`              | Requires an attempt or duration bound on retry schedules                                  |
| `effect/noDynamicImports`              | Allows import() only behind a named lazy-loading boundary; bans require()                 |
| `effect/noEffectDo`                    | Bans Effect.Do                                                                            |
| `effect/noEffectBind`                  | Bans Effect.bind                                                                          |
| `effect/preferCatchTag`                | Replaces manual `_tag` predicates and `catchAll` dispatch with tagged recovery            |
| `effect/preferEffectFn`                | Requires `Effect.fn` for a generator operation that adds a span                           |
| `effect/preferMatchTagsExhaustive`     | Requires exhaustive `Match` for return-only `_tag` switches and if chains                 |
| `effect/preferPredicateIsTagged`       | Replaces combined `_tag` comparisons with a named `Predicate` refinement                  |
| `effect/preferServiceOf`               | Checks inline Layer implementations through `Service.of`                                  |
| `effect/requireNamedEffectFn`          | Requires stable names for `Effect.fn` operations                                          |
| `effect/noGlobals`                     | Bans ambient capabilities with direct Effect replacements; allows `process.std*.isTTY`    |
| `effect/noNodeBuiltinImport`           | Bans fully replaced Node modules and replaced operations from partial modules             |

## Anti-Slop Rules

The recommended preset also includes these rules from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop):

| Rule                                    | Contract                                                           |
| --------------------------------------- | ------------------------------------------------------------------ |
| `effect/noChainedTypeAssertions`        | Bans nested type assertions that invent type evidence              |
| `effect/noConditionalEmptyObjectSpread` | Bans conditional spreads that use an empty object to omit fields   |
| `effect/noKnownValueWidening`           | Bans broad target types that discard known value evidence          |
| `effect/noObjectParameters`             | Bans the broad `object` type on function inputs                    |
| `effect/noRuntimeTypeof`                | Requires boundary parsing instead of runtime `typeof` narrowing    |
| `effect/noShapeInSymbolNames`           | Bans `shape` in symbol names                                       |
| `effect/noUnknownParameters`            | Bans `unknown` inputs except an input named `cause`                |
| `effect/noUnknownTypeAliases`           | Bans aliases that only hide `unknown`                              |
| `effect/noUnsafeDictionaryType`         | Bans dictionaries with unsafe broad value types                    |
| `effect/noWidenThenAssert`              | Bans local flows that widen known values and then assert them back |

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

`bun run codegen` owns both the rule export barrel and the recommended preset.
`bun run gate` fails when either generated file is stale.

## License

MIT
