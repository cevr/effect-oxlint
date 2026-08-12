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

If the project uses JSON configuration, copy the exported rule map into `rules`; every recommended rule has `error` severity.

## Recommended Rules

| Rule                          | Contract                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `effect/noAs`                 | Bans TypeScript `as` assertions; use `satisfies`                                          |
| `effect/noAsyncFunction`      | Bans async functions and await expressions                                                |
| `effect/noTryCatch`           | Bans every try/catch/finally statement                                                    |
| `effect/noTestLifecycleHooks` | Bans `beforeEach`, `afterEach`, `beforeAll`, and `afterAll`; use Effect scopes instead    |
| `effect/noThrowStatement`     | Bans every throw statement                                                                |
| `effect/noNewPromise`         | Bans new Promise, Promise calls, and Promise static APIs                                  |
| `effect/noNewError`           | Allows native Error values only as direct arguments to Effect.die, Cause.die, or Exit.die |
| `effect/noNullish`            | Bans null and undefined; use Option or a domain enum for richer state                     |
| `effect/noTernary`            | Bans conditional expressions while allowing ordinary if statements                        |
| `effect/noDynamicImports`     | Allows import() only behind a named lazy-loading boundary; bans require()                 |
| `effect/noEffectDo`           | Bans Effect.Do                                                                            |
| `effect/noEffectBind`         | Bans Effect.bind                                                                          |
| `effect/preferEffectFn`       | Requires `Effect.fn` for a generator operation that adds a span                           |
| `effect/noGlobals`            | Bans ambient capabilities with direct Effect replacements; allows `process.std*.isTTY`    |
| `effect/noNodeBuiltinImport`  | Bans fully replaced Node modules and replaced operations from partial modules             |

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

The preset intentionally allows `Effect.as`, `Option.as`, `Effect.never`, `Effect.async`, ordinary `if` and `switch` statements, and runtime runners at explicit application boundaries.

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
