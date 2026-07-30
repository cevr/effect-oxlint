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
| `effect/noAsyncFunction`      | Bans async functions and await expressions                                                |
| `effect/noTryCatch`           | Bans every try/catch/finally statement                                                    |
| `effect/noTestLifecycleHooks` | Bans `beforeEach`, `afterEach`, `beforeAll`, and `afterAll`; use Effect scopes instead    |
| `effect/noThrowStatement`     | Bans every throw statement                                                                |
| `effect/noNewPromise`         | Bans new Promise, Promise calls, and Promise static APIs                                  |
| `effect/noNewError`           | Allows native Error values only as direct arguments to Effect.die, Cause.die, or Exit.die |
| `effect/noTernary`            | Bans conditional expressions while allowing ordinary if statements                        |
| `effect/noDynamicImports`     | Allows import() only behind a named lazy-loading boundary; bans require()                 |
| `effect/noEffectDo`           | Bans Effect.Do                                                                            |
| `effect/noEffectBind`         | Bans Effect.bind                                                                          |
| `effect/noGlobals`            | Bans ambient capabilities with direct Effect replacements; allows `process.std*.isTTY`    |
| `effect/noNodeBuiltinImport`  | Bans fully replaced Node modules and replaced operations from partial modules             |

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
```

## License

MIT
