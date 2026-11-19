# oxlint-plugin-effect

A strict, non-type-aware oxlint plugin for Effect-native TypeScript.

The package has one recommended preset. It protects application code from imperative failure handling, Promise control flow, ambient runtime dependencies, and a small set of non-idiomatic Effect APIs. Effect tsgo remains responsible for semantic and type-aware correctness.

## Install

Requires Effect **>=4.1.0 <5**. Replacement advice targets the `effect/crypto` services introduced in 4.1; the plugin does not detect an application's Effect minor version.

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

Every recommended rule has `error` severity. The complexity rules carry their limit as an option, `["error", { "max": 21 }]`; native `complexity` also counts a `switch` as one branch (`"variant": "modified"`).

## Recommended Rules

| Rule                                   | Contract                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noAs`                          | Bans TypeScript `as` and `<T>x` assertions; use `satisfies` (`as const` and `<const>x` are allowed)                                                                                                                                                                                                                                                                                                                       |
| `effect/noAsyncFunction`               | Bans async functions and await expressions                                                                                                                                                                                                                                                                                                                                                                                |
| `effect/noTryCatch`                    | Bans every try/catch/finally statement                                                                                                                                                                                                                                                                                                                                                                                    |
| `effect/noTestLifecycleHooks`          | Bans `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `before` and `after` unless a local function or a project import binds the name; use Effect scopes instead                                                                                                                                                                                                                                                       |
| `effect/noThrowStatement`              | Bans every throw statement                                                                                                                                                                                                                                                                                                                                                                                                |
| `effect/noNewPromise`                  | Bans new Promise, Promise calls, and Promise static APIs                                                                                                                                                                                                                                                                                                                                                                  |
| `effect/noPromiseChainsInTests`        | Bans `.then`, `.catch`, and `.finally` Promise chains in test files                                                                                                                                                                                                                                                                                                                                                       |
| `effect/noNewError`                    | Allows native Error values only as direct arguments to Effect.die, Cause.die, or Exit.die                                                                                                                                                                                                                                                                                                                                 |
| `effect/noNullish`                     | Bans null and undefined; permits `Object.create(null)` for prototype-free dictionaries                                                                                                                                                                                                                                                                                                                                    |
| `effect/noModuleMocks`                 | Bans Vitest, Jest, and bun:test module mocks, mock functions, and spies; use test layers                                                                                                                                                                                                                                                                                                                                  |
| `effect/noTestGlobals`                 | Bans global writes, global stubs, and implicit runner globals in test files                                                                                                                                                                                                                                                                                                                                               |
| `effect/noTernary`                     | Bans conditional expressions while allowing ordinary if statements                                                                                                                                                                                                                                                                                                                                                        |
| `effect/noManagedRuntimeInEffect`      | Keeps ManagedRuntime construction at non-Effect host boundaries                                                                                                                                                                                                                                                                                                                                                           |
| `effect/noModuleLevelMutableState`     | Bans module-level `let` and `var` outside tests; hold shared state in a Layer-owned `Ref`                                                                                                                                                                                                                                                                                                                                 |
| `effect/noEagerAcquire`                | Bans `acquireRelease` acquires that build or capture the resource before acquire runs                                                                                                                                                                                                                                                                                                                                     |
| `effect/noEffectRunInTests`            | Bans `Effect.run*`, a runtime's `run*` methods, and `ManagedRuntime.make` in tests; use `it.effect` or `it.layer`                                                                                                                                                                                                                                                                                                         |
| `effect/noEffectBunTestItCall`         | Bans calling effect-bun-test's `it`; it holds the runners and throws when called                                                                                                                                                                                                                                                                                                                                          |
| `effect/noFixedWaitInTests`            | Bans waiting by time in tests (waited or stored sleeps, `scheduler.wait`, `waitForTimeout`, timer-only Promises through a global or a resolving handler, but not a `Promise.race` arm or a route delay, a `TestClock` advance of a flush amount, through a flush name or in a polling loop); wait on the event, and advance `TestClock` only to the time under test                                                       |
| `effect/noRepoTempDirectory`           | Bans test temp directories under the repo (a repo `directory`, a relative `mkdtemp` prefix, a `tmp` segment joined to a repo path)                                                                                                                                                                                                                                                                                        |
| `effect/noSharedTestHome`              | Bans a test home, data or working directory under the shared temp root (`/tmp`, `tmpdir()`); `keys` names more home keys                                                                                                                                                                                                                                                                                                  |
| `effect/noInlineProvide`               | Keeps dependency provisioning at explicit composition boundaries, provided once: no second `Effect.provide` right after another in one pipe outside tests                                                                                                                                                                                                                                                                 |
| `effect/noNestedEffectGen`             | Flattens directly yielded nested generators                                                                                                                                                                                                                                                                                                                                                                               |
| `effect/noPerCallCacheConstruction`    | Constructs shared caches once in their owning layer                                                                                                                                                                                                                                                                                                                                                                       |
| `effect/noPointFreeLog`                | Calls a logger that prints every argument (`console.log`/`info`/`warn`/`error`/`debug`/`trace`, `Console.*` of the same, `Effect.log*`) in a callback instead of handing it to one that is passed an index, which it would print                                                                                                                                                                                          |
| `effect/noRunCollectOnUnboundedStream` | Requires termination before collecting a clearly unbounded Stream                                                                                                                                                                                                                                                                                                                                                         |
| `effect/noSequentialEffectAll`         | Uses explicit sequencing when serial aggregation discards its result                                                                                                                                                                                                                                                                                                                                                      |
| `effect/noSilentCatchAll`              | Keeps swallowed failures visible or recovers them truthfully                                                                                                                                                                                                                                                                                                                                                              |
| `effect/noUnboundedConcurrency`        | Requires finite concurrency for collections that can grow                                                                                                                                                                                                                                                                                                                                                                 |
| `effect/noUnboundedRetry`              | Requires an attempt or duration bound on retry schedules                                                                                                                                                                                                                                                                                                                                                                  |
| `effect/requireForceKillAfter`         | Requires `forceKillAfter` on `ChildProcess.make` so a child that ignores its kill signal (SIGTERM unless `killSignal` names another) cannot hold its scope open; a SIGKILL command is left alone                                                                                                                                                                                                                          |
| `effect/noDynamicImports`              | Allows import() only behind a named lazy-loading boundary (none with `allowNamedBoundaries: false`); bans require()                                                                                                                                                                                                                                                                                                       |
| `effect/noEffectDo`                    | Bans Effect.Do                                                                                                                                                                                                                                                                                                                                                                                                            |
| `effect/noEffectBind`                  | Bans Effect.bind                                                                                                                                                                                                                                                                                                                                                                                                          |
| `effect/preferCatchTag`                | Replaces manual `_tag` predicates and `catchAll` dispatch with tagged recovery                                                                                                                                                                                                                                                                                                                                            |
| `effect/preferEffectFn`                | Requires `Effect.fn` for a generator operation that adds a span                                                                                                                                                                                                                                                                                                                                                           |
| `effect/preferMatchTagsExhaustive`     | Requires exhaustive `Match` for return-only `_tag` switches and if chains in Effect files                                                                                                                                                                                                                                                                                                                                 |
| `effect/preferPredicateIsTagged`       | Replaces combined `_tag` comparisons with a named `Predicate` refinement in Effect files                                                                                                                                                                                                                                                                                                                                  |
| `effect/preferSchemaTaggedUnion`       | Declares `_tag` unions of any tag case with `Schema.TaggedUnion` or `toTaggedUnion`, not hand-written type literals                                                                                                                                                                                                                                                                                                       |
| `effect/preferServiceOf`               | Checks inline Layer implementations through `Service.of`                                                                                                                                                                                                                                                                                                                                                                  |
| `effect/preferTaggedConstructors`      | Prefers schema case `.make` over raw `_tag` objects; `Data.taggedEnum` and domain constructors remain valid                                                                                                                                                                                                                                                                                                               |
| `effect/noAliasTestLayer`              | Bans a `Test`/`Fake`/`Stub`/`Mock` layer static that only returns the live layer                                                                                                                                                                                                                                                                                                                                          |
| `effect/requireNamedEffectFn`          | Requires stable names for `Effect.fn` operations                                                                                                                                                                                                                                                                                                                                                                          |
| `effect/requireSuppressionReason`      | Requires lint, Effect, and TS suppressions to name their target and give a `--` reason                                                                                                                                                                                                                                                                                                                                    |
| `effect/noComments`                    | Bans comments other than doc comments above code and tool directives (suppressions, `@ts-*`, `@effect-diagnostics`, triple-slash references, `#__PURE__`, bundler magic comments such as `@vite-ignore` and `webpackChunkName`, JSX pragmas, formatter and coverage ignores, `@__INLINE__`, licence comments such as `/*!` and `SPDX-License-Identifier:`, `nosemgrep`, `sourceMappingURL`) and a generated file's header |
| `effect/noLintEvasion`                 | Bans `undefined` and `unknown` spelled through `Option.none()` or `Schema.Unknown`                                                                                                                                                                                                                                                                                                                                        |
| `effect/noGlobals`                     | Bans Effect-replaced capabilities through every global-object hop, alias and hold; allows `process.std*.isTTY`; `members` bans more                                                                                                                                                                                                                                                                                       |
| `effect/noNodeBuiltinImport`           | Bans fully replaced Node modules and replaced operations from partial modules; `modules` bans more                                                                                                                                                                                                                                                                                                                        |
| `effect/noModulePathFacts`             | Bans `import.meta.dirname`/`filename`/`dir`/`path` and hand-read module URLs (`.pathname`, string cuts); use `Path.fromFileUrl`                                                                                                                                                                                                                                                                                           |
| `effect/noLocaleCompare`               | Bans `localeCompare` and `Intl.Collator`, which order by the process locale; use `Order.String`                                                                                                                                                                                                                                                                                                                           |

`effect/noComments` is in the preset so new code starts without comments. A `/** */` doc comment on the lines above a declaration or member stays, since editors show it to callers, and so does a generated file's first comment when it says so (`@generated`, `generated by`, `DO NOT EDIT`). `oxlint --fix` removes the comments it reports (a comment's own line, or the space beside it): names and types say what code does, a suppression's reason goes after `--`, history goes in the commit message, and a rule becomes a lint rule. A codebase that already documents itself in comments turns it off: `"effect/noComments": "off"` after spreading the preset.

`effect/requireSuppressionReason` also rejects `@effect-diagnostics effect/name:off`: @effect/tsgo ignores the `effect/` prefix, so write the bare rule name. A blanket directive that covers its own line, such as a bare `// oxlint-disable-line` or a file-leading `/* eslint-disable */`, suppresses this rule's report too; oxlint applies the directive before the rule can report it.

## Tagged constructors

Prefer schema constructors when defining tagged variants and creating values at
call sites. `Schema.TaggedUnion` provides a schema for each variant through
`.cases`. Its `.make` constructor supplies `_tag`:

```ts
import { Schema } from "effect";

const CollectionState = Schema.TaggedUnion({
  ready: { readyRevision: Schema.Number },
  bootstrap: {},
});
type CollectionState = typeof CollectionState.Type;

const ready = CollectionState.cases.ready.make({ readyRevision: 42 });
const bootstrap = CollectionState.cases.bootstrap.make({});
```

An existing `Schema.TaggedStruct` or domain constructor works too. Decode untrusted
input with the owning schema at the boundary.

`Data.TaggedEnum` with `Data.taggedEnum` constructors remains a supported choice for
internal state:

```ts
import { Data } from "effect";

type PullSample = Data.TaggedEnum<{
  Success: { readonly latencyMs: number };
  Failure: {};
}>;
const PullSample = Data.taggedEnum<PullSample>();

const sample = PullSample.Success({ latencyMs: 12 });
```

`effect/preferTaggedConstructors` reports object expressions with a static `_tag`
key and a string literal, a template without substitutions, or a const alias to
one of those values. It also recognizes type-only wrappers such as `as const` and
`satisfies`. The rule applies without an Effect import, including in tests and
hand-written factory functions; wrapping a literal in a function does not give it
the owning type's constructor. Schema field declarations and type literals are
allowed. Dynamic tags, computed expression keys, getters, and tags carried only by
spreads are outside this syntax rule's scope.

There is no automatic fix because the rule cannot choose the owning type or its
constructor. A raw malformed wire fixture or a custom constructor implementation
can use a targeted suppression with a reason.

## Opt-in Rules

These rules encode a project policy the preset cannot assume. The plugin registers them, and the preset leaves them off; enable each by name.

| Rule                                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noPlatformLayerOutsideEntry`    | Provides `@effect/platform-*` layers (and the `layers` option names) only in entry files an override exempts                                                                                                                                                                                                                                                                                                                                 |
| `effect/noPositionalLogArguments`       | Passes one message to `Effect.log*` and attaches data with `Effect.annotateLogs`                                                                                                                                                                                                                                                                                                                                                             |
| `effect/noRunPromise`                   | Keeps `Effect.runPromise*` and runtime `runPromise` calls in boundary files an override exempts                                                                                                                                                                                                                                                                                                                                              |
| `effect/noUnsignaledPoll`               | Reports `expect.poll`, `vi.waitFor` and a hand-written poll loop whose polled value is a mock's calls or a recorder's `length`/`size`, or that asserts with a spy matcher: have the code under test signal the test                                                                                                                                                                                                                          |
| `effect/noFlakeMasking`                 | Reports a test retry or raised timeout: a `retry`/`timeout` option or a timeout argument on `test`, `it`, `describe` and their modifiers (`it.effect`, `it.scoped`, `test.each(…)(…)`), `retry`, `testTimeout` and `hookTimeout` in a runner config's `test:` block or `vi.setConfig`, and `it.flakyTest`. A test that needs them proves nothing                                                                                             |
| `effect/noTimeoutDieInTests`            | Fails a test's timeout with a typed error instead of `Effect.die`                                                                                                                                                                                                                                                                                                                                                                            |
| `effect/noWithWrapperCall`              | Pipes values through `withX` adapters instead of wrapping calls or callbacks; `allow` exempts names, `testFiles` narrows the test exemption                                                                                                                                                                                                                                                                                                  |
| `effect/noInterruptibleMemo`            | Memoizes a run that must start once as a started fiber; `Effect.cached*` gives up a run its callers leave (on effect 4.0.0 later callers get the interruption back while the entry lives; from 4.0.1 the next caller starts the run again)                                                                                                                                                                                                   |
| `effect/requireSpawnBudget`             | Gives a test that calls a process starter (Bun, `node:child_process`) or `ChildProcess.make`, itself or through a helper, its timeout, after its body, as `{ timeout }`, or by its suite's; groups, fixtures and hooks are not tests; `minimum` sets the least it may name                                                                                                                                                                   |
| `effect/tn1Lint`                        | Reports the advisory findings of TN1 networks, run by the installed `@cevr/tn1-lint` package; `nets` names each network's weights file                                                                                                                                                                                                                                                                                                       |
| `effect/requireSchemaTaggedError`       | Declares Effect failures as `Schema.TaggedError`: reports classes extending `Error`, `Data.TaggedError`/`Data.Error` (`allowDataTaggedError` keeps them) and hand-written `_tag` failure classes (named `…Error`/`…Failure`/`…Defect` or with a `message`)                                                                                                                                                                                   |
| `effect/noSchemaClass`                  | Models app data with `Schema.Struct` and a same-name `interface`, not `Schema.Class` or `Schema.TaggedClass`                                                                                                                                                                                                                                                                                                                                 |
| `effect/noModeFieldWithOptionals`       | Models a mode as a union of one record per mode: reports an interface, type literal or `Schema.Struct` with a required literal-union `status`/`state`/`type`/`kind`/`mode`/`phase`/`stage` field and two or more optional siblings. Skips `…Props` types, parameter type literals and wire formats (snake_case members, an `object: "…"` member), and files matching an `allow` glob (a vendor API mirror: `{ "allow": ["**/clients/**"] }`) |
| `effect/noCauseRecoveryOutsideBoundary` | Bans `Effect.catchAllCause`, `catchCause` and `sandbox` outside the `boundaries` globs and outside a `// boundary: <reason>` comment: recover typed failures with `catchTag`/`catchTags`                                                                                                                                                                                                                                                     |
| `effect/noKindNamedFiles`               | Bans paths named by kind: `services/`, `utils/`, `helpers/` folders and `*.service.ts`, `utils.ts`, `*.helpers.ts` files (`allow` globs exempt): name by concept                                                                                                                                                                                                                                                                             |
| `effect/importBoundary`                 | Path-configured import boundaries: each `boundaries` entry gives `files` globs and `deny` or `allowOnly` specifier globs (relative imports matched as resolved paths), for vendor-free domain files, contexts that do not import each other's aggregates and an allow-listed domain package                                                                                                                                                  |

### TN1 networks

`effect/tn1Lint` reports judgements no exact rule can make, such as a comment that narrates the line under it. Each is decided by a TN1 network: a small all-integer network whose weights file is reviewable text, giving the same answer on every host, locally and for free. The engine is not bundled. The rule runs the binary of the [`@cevr/tn1-lint`](https://www.npmjs.com/package/@cevr/tn1-lint) package once per configured network, with the file's text on its standard input, and reports each finding with its probability. Install the package beside the plugin, and set the rule to `warn`:

```json
{
  "rules": {
    "effect/tn1Lint": ["warn", { "nets": { "narration": "lint/narration.tn1" } }]
  }
}
```

Weights paths are read from the lint root. The `binary` option names another `tn1-lint` binary. A missing package, an unreadable weights file or a failed run is one finding at the file's start, so a configured rule never goes quiet. A sidecar that cannot start (the package throws with code `TN1_SIDECAR_DOWN`) is reported once, on the first file, and sets the run's exit code to 1 even at `warn`: every file would go unlinted, and a CI step must not pass on that. On Linux, Node starts the binary by `fork`, and under the kernel's heuristic overcommit that fork can fail with `ENOMEM` when oxlint's threads hold more memory than the host has free. Run oxlint with `--threads=4` or fewer there.

## Skill Presets

Opt-in presets of rules distilled from written practice (the react, composition, effect, domain-modeling and writing-tests skills). None is in `recommended`. Enable one by extending its JSON form (`./node_modules/oxlint-plugin-effect/presets/<name>.json`) or spreading its TypeScript form (`import { skillsReact } from "oxlint-plugin-effect/presets"`). Each message names the fault, why it matters and what to write instead.

### `skills-react`

| Rule                               | Contract                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noDerivedStateEffect`      | Reports an effect (with dependencies) whose body only calls the component's own state setters: compute a derived value during render, or reset with a `key` or in the handler. Narrower than oxlint's `react/set-state-in-effect`                                                      |
| `effect/noEffectSyncUp`            | Reports an effect whose body only passes values to `on…` callback props: lift the state to the parent or a provider. A call with no argument or with a ref's `.current` is a hand-off and is left alone                                                                                |
| `effect/noEffectEventLogic`        | Reports an effect that runs logic when a flag state turns true while a handler sets the flag to `true`: run the logic in that handler. DOM work on a ref (`focus`) is left alone                                                                                                       |
| `effect/noPromiseMirroredState`    | Reports a hand-set loading flag around an `await` (`set(true)`, `await`, `set(false)`) and an effect that copies a promise's result into state: use `useTransition`, a query or a mutation                                                                                             |
| `effect/preferColocatedState`      | Reports a `useState` pair whose value and setter are used only in JSX: passed to one component element alone (that child can own it), or used only inside a list row rendered by `.map` (a row component owns it). Other subtrees, test modules and `*.fixture.*` files are left alone |
| `effect/noBooleanStateCluster`     | Reports a component with three or more boolean `useState` pairs, once: name the modes in one state of a union type                                                                                                                                                                     |
| `effect/noEffectInFeature`         | Bans `useEffect`/`useLayoutEffect` in feature code: allowed in a hook whose name matches `adapterHooks` (default `Adapter$                                                                                                                                                             | Subscription$`) or a file matching an `adapters` glob. Adopt it with a baseline |
| `effect/noForwardRef`              | React 19: bans `forwardRef`; take `ref` as a prop                                                                                                                                                                                                                                      |
| `effect/preferUse`                 | React 19: `use(Context)` instead of `useContext(Context)`                                                                                                                                                                                                                              |
| `effect/noParameterlessRenderProp` | Reports a `render…` prop whose inline function takes no parameters: pass children or a compound part                                                                                                                                                                                   |
| `effect/noSilentContextDefault`    | Reports `createContext` with a default object of functions: default to `null` and throw from the accessor                                                                                                                                                                              |

Component rules skip test modules: a probe component in a test may sync up on purpose.

### `skills-perf`

Work that grows faster than the data. Each rule has a counted cost in `tests/perf/<rule>.ts`: callback calls or comparisons of the reported form and the remedy at n and 2n.

| Rule                          | Contract                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noLinearSearchInLoop` | Reports `find`, `findIndex`, `some` or `filter` that compares its element with the element of an enclosing loop over another collection (n × m): build a `Map` or `Set` once. A loop over an array literal, a search of an array literal or an UPPER_CASE constant (a fixed table) and a collection built inside the loop are left alone |
| `effect/noSortForExtreme`     | Reports `sort(…)[0]`, `toSorted(…)[0]` and `.at(0)` / `.at(-1)` on a sort (n log n): find the minimum or maximum in one pass                                                                                                                                                                                                             |
| `effect/noRepeatedPass`       | Reports the second pass (`filter`, `reduce`, `some`, `every`, `find`, `findIndex`) over one unchanged array on one straight path of a block (k × n): one loop. A pass that reads the first one's result is left alone                                                                                                                    |

The perf rules skip test modules: test data is small by design.

### `skills-tests`

Weak tests in their exact forms. These rules read test modules only (`*.test.*`, `*.spec.*` and `effect.testFiles`). A `// contract: <reason>` comment above a case or a statement keeps a value or a snapshot that is pinned on purpose.

| Rule                               | Contract                                                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/noConstantRestated`        | Reports a case whose every expectation compares a bare constant (`LIMIT`) or a literal with a literal (`toBe`, `toEqual`, `toStrictEqual`): it passes by construction                                                                                |
| `effect/noRepeatedCase`            | Reports a case whose body repeats an earlier case in the same block and reads no variable an enclosing `describe` callback or loop binds                                                                                                             |
| `effect/noEmptyTest`               | Reports a case with an empty body: assert its outcome or use `it.todo`                                                                                                                                                                               |
| `effect/noExistenceOnlyAssert`     | Reports a case whose every expectation is `toBeDefined` or `toBeTruthy`, unless it checks a lookup by predicate (`find`) or also asserts through a helper (`expectX`, `assert`)                                                                      |
| `effect/noSnapshotWithoutContract` | Reports a snapshot matcher without a `contract:` comment naming the output it pins. A snapshot of a call's result written in place (`expect(render(x)).toMatchSnapshot()`) and one in a `*.golden.*` file are the output contract and are left alone |

### `skills-solid`

The react skill's state rules translated to Solid (`ui/platforms/web/solid.md`). They read files that import `solid-js` (or `solid-js/…`, `@solidjs/…`): a component is a capitalized function that returns JSX, its signals are `createSignal` pairs, and an effect writes in its last function (Solid 2's `apply`, Solid 1's only function). The React rules are unchanged and do not read Solid files. `effect/noParameterlessRenderProp` reads JSX alone, so it is in both `skills-react` and `skills-solid`.

| Rule                               | Contract                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `effect/noBooleanSignalCluster`    | Reports a Solid component with three or more boolean `createSignal`s: one signal of a union type names the modes                                                                                                                                             |
| `effect/noDerivedSignalEffect`     | Reports a `createEffect` whose writer only calls the component's signal setters: derive with `createMemo` or a function                                                                                                                                      |
| `effect/noPromiseMirroredSignal`   | Reports a loading signal set around an `await`, and an effect that sets a signal from a promise's result: use an async computation (`createResource`, Solid 2's async `createMemo`)                                                                          |
| `effect/noAccessorProp`            | Reports a member of a component's props type typed as a getter (`routes: () => Route[]`, `routes(): Route[]`, `Accessor<Route[]>`): Solid props are live, type the value. `on…`, `get…`, `render…`, `children` and functions returning `void` are left alone |
| `effect/noParameterlessRenderProp` | As in `skills-react`: a `render…` prop whose inline function takes nothing                                                                                                                                                                                   |

### `skills-domain`

Rules for `@alchemy.run/domain` models. They read the building blocks a file declares with the package's `Aggregate`, `View`, `Event` and `Rejection` (`Domain.Aggregate(…)` or a named import), and nothing in a file that does not import the package.

| Rule                      | Contract                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/pureDecide`       | Reports, inside an aggregate's `decide` handlers, `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, `crypto.randomUUID()`, `Clock.…`, `Random.…` and `fetch(…)`: take time from `decide`'s `now` argument                                                                                      |
| `effect/totalEvolve`      | Reports, inside an aggregate's or view's `evolve` and `reply` handlers, `throw`, `Effect.fail…`, `Effect.die…`, `yield*` and `new` of a rejection: refuse in `decide`, keep any state the event cannot follow                                                                                                  |
| `effect/eventNameIsAFact` | A hint: reports an event tag ending in `Updated`, `Set`, `Changed` or `Modified`: name the business fact (`PostRetitled`)                                                                                                                                                                                      |
| `effect/glossaryTerms`    | Reports a declared name (variable, parameter, function, class, type, member, key) whose words hold a term from an `_Avoid_:` list of the `glossary` file (`{ "glossary": "GLOSSARY.md" }`, the domain-modeling format): rename it with the glossary's term. Imports are left alone; no `glossary`, no findings |

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

`effect/noSharedTestHome` reads test code whole, and in other files only the test layers (a `static Test`, a `…TestLayer` binding, a `Test:` key). It knows the generic home keys (`home`, `HOME`, `homeDir`, `homeDirectory`, `dataDir`, `cwd`, any `…Cwd`); a project adds its own with `keys`:

```json
{ "rules": { "effect/noSharedTestHome": ["error", { "keys": ["MYAPP_DATA_DIR", "userDir"] }] } }
```

## Baselines

A ban that existing code breaks (`effect/noComments`, `effect/noEffectInFeature`, `effect/noKindNamedFiles`, `effect/noCauseRecoveryOutsideBoundary`, `effect/tn1Lint`) is adopted with a `baseline`: each file's path, relative to the lint root, and the count of findings it has today. A key matches the whole path or a suffix at a `/`.

```json
{ "rules": { "effect/noComments": ["error", { "baseline": { "src/legacy.ts": 12 } }] } }
```

A file with exactly its count is silent. With more, every finding is reported: a count cannot tell which one is new. With fewer, one `stale baseline` finding names the new count, so the baseline only shrinks. A count of 0 is refused: such a file has no entry. A count is silent about which findings it holds, so a fixed one and a new one cancel; a diff-scoped check is the stricter tool. This repository lints itself with `noComments` under `oxlint.self.baseline.json`.

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
| `complexity` (native oxlint)    | Cyclomatic complexity, `modified` variant  | 21    |
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

Application code should use Effect services for time, randomness, secure randomness, digests, MACs, signatures, supported encryption and key derivation, configuration, files, paths, child processes, stdio, HTTP, sockets, workers, streams, logging, JSON boundaries, encoding, and key-value storage.

The rules are capability-based. `noGlobals` recommends `SecureRandom` from `effect/crypto` for Web Crypto randomness and UUIDs and `Bun.randomUUIDv7`, and `Digest` from `effect/crypto` for `crypto.subtle.digest`. `noNodeBuiltinImport` also maps Node hashing to `Digest`, HMAC to `Mac`, constant-time byte comparison to `Mac.timingSafeEqual`, signing to `Signature`, cipher creation to `Aead` or `Cipher`, HKDF/PBKDF2/Argon2 to `Kdf`, key agreement to `KeyAgreement`, and key generation to the corresponding crypto families. These are service and algorithm migrations, not drop-in API replacements: only the algorithms each Effect service supports are covered. Scrypt, legacy finite-field DH constructors, DNS, UDP, compression, module resolution, FFI, VM inspection, and unmatched Buffer/EventEmitter/native-stream operations remain adapter capabilities.

Crypto services require explicit layers at the entry point; runtime services bundles no longer include crypto. Use the family's `layerWebCrypto` (for example, `Digest.layerWebCrypto`) or the individual/combined `BunCrypto` or `NodeCrypto` layers from the matching platform package. Some Web Crypto family layers also require `SecureRandom`.

Existing global bans point `Bun.Glob` to `FileSystem.glob`, stream access (including `process.stdout.columns`) to `Terminal.size` alongside stdio, and environment access to `Config` or `UserDirectories` from `effect/persistence` for XDG paths. For `noGlobals`, configured `use` messages still take precedence. Package imports for globbing, semver, JSONC, TOML, YAML, and CSV and `os.homedir` have no built-in detection yet; they can be configured through `modules` below. Their replacements are `FileSystem.glob` (or `Glob` for matching), `SemVer`/`SemVerRange`, `Jsonc`/`Toml`/`Yaml`/`Csv` from `effect/encoding`, and `UserDirectories`, respectively. The encoding configuration examples target Effect 4.1.2; `Jsonc` was added in that patch.

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

A project that keeps a runtime behind adapters bans more with options: `noGlobals` takes `members` (a global's members, all of them or the listed `properties`; a list of such bans when its members name different replacements, and a configured `use` is named before the built-in one), and `noNodeBuiltinImport` takes `modules` (a module, or a `*` prefix such as `bun:*`; `members` narrows the ban to those named imports and alias reads). The adapter override then turns the rules off, or configures them without the options to keep only the built-in bans:

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
          "os": { "members": ["homedir"], "use": "UserDirectories from 'effect/persistence'" },
          "glob": { "use": "FileSystem.glob" },
          "semver": { "use": "SemVer or SemVerRange" },
          "jsonc-parser": { "use": "Jsonc from 'effect/encoding'" },
          "toml": { "use": "Toml from 'effect/encoding'" },
          "yaml": { "use": "Yaml from 'effect/encoding'" },
          "csv-parse": { "use": "Csv from 'effect/encoding'" },
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
            "members": { "Bun": { "properties": ["Glob"], "use": "FileSystem.glob" } },
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
