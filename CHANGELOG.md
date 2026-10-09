# oxlint-plugin-effect

## 0.28.0

### Minor Changes

- [#60](https://github.com/cevr/effect-oxlint/pull/60) [`78594b7`](https://github.com/cevr/effect-oxlint/commit/78594b72fbde35dac4be8d13b193537cad688fc5) Thanks [@cevr](https://github.com/cevr)! - Add the recommended `preferTaggedConstructors` rule to report raw `_tag` object construction and prefer `Schema.TaggedUnion` case constructors or `Schema.TaggedStruct` constructors. `Data.taggedEnum` and existing domain constructors remain valid. Recognize static keys, type-only wrappers, and const tag aliases while allowing schema declarations.

## 0.27.1

### Patch Changes

- [#58](https://github.com/cevr/effect-oxlint/pull/58) [`ce08e15`](https://github.com/cevr/effect-oxlint/commit/ce08e1506eda79f145d9cc053d2d8b2e8081cf43) Thanks [@cevr](https://github.com/cevr)! - Recognize literal string and static template member keys in noNodeBuiltinImport. Imported process and crypto capabilities and configured module members now receive the same diagnostics as dot access, while dynamic keys and unmatched members remain allowed.

## 0.27.0

### Minor Changes

- [`606708c`](https://github.com/cevr/effect-oxlint/commit/606708c3318c174d94a5efd872f5f85019390436) Thanks [@cevr](https://github.com/cevr)! - Report `cached*` named imports and remove unsafe exemptions for uninterruptible inputs and function-shaped TTLs. Protecting the input does not protect cache settlement, and a function alone does not establish interruption's lifetime.

  Remove the opt-in `noCodeUnitPadding` rule. Display width belongs to the terminal application's policy; Gent now owns a stricter rule with proven ASCII receiver and padding checks.

## 0.26.0

### Minor Changes

- [`88f6561`](https://github.com/cevr/effect-oxlint/commit/88f6561fece82dc255fa4aec2313924e0beeb7b6) Thanks [@cevr](https://github.com/cevr)! - New opt-in rule `noCodeUnitPadding`: it reports `padStart` and `padEnd` on any receiver but a number rendered as ASCII (`String(n)`, `n.toString(…)`, `toFixed`, `toPrecision`, `toExponential`). Both count UTF-16 code units, so a wide, combining or emoji character misaligns a padded column; pad by display width instead. A project enables it for the files that draw columns (a terminal UI, a CLI table) with an override.

- [`0e6728d`](https://github.com/cevr/effect-oxlint/commit/0e6728df579ee6a5d387a13eab128b087f7b25c4) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `noInterruptibleMemo`: it reports `Effect.cached`, `Effect.cachedWithTTL` and `Effect.cachedInvalidateWithTTL`, data-first or as a `.pipe(...)`/`pipe(...)` operator. Each runs the memoized effect in its first caller's fiber and keeps the exit that fiber reaches, so once that caller is interrupted every later caller gets the interruption back until the TTL ends. The message names the fixes: memoize a started fiber (fork once, then `Fiber.join` in each caller) or use `Cache`, which runs each lookup in a fiber of its own. An effect whose last step is `Effect.uninterruptible`, and a TTL given as a function (it can give an interruption no lifetime), are not reported.

## 0.25.0

### Minor Changes

- [`0731395`](https://github.com/cevr/effect-oxlint/commit/07313952835ce73e09e237a74ed894ac3e197519) Thanks [@cevr](https://github.com/cevr)! - `noAs` also reports the angle-bracket assertion `<T>x` of `.ts` files, with the same message and the same exemption: `<const>x` stays allowed like `as const`. Until now only `typescript/no-unsafe-type-assertion` held that spelling, so a project kept it on as a second owner of assertions.

- [`61301f1`](https://github.com/cevr/effect-oxlint/commit/61301f16c75cedbd99b36b680df959e936545f54) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `noLocaleCompare`: it reports `localeCompare` on any receiver (`a.localeCompare(b)`, `a["localeCompare"]`) and `Intl.Collator` called or constructed through any spelling of the global (`new Intl.Collator()`, `Intl.Collator()`, `globalThis.Intl.Collator`, an alias or destructure of `Intl`). Both order by the locale and ICU data of the running process, so the same input sorts differently on another machine; output that must be stable, such as prompt bytes and listings, uses `Order.String`, which orders by UTF-16 code unit.

- [`504175a`](https://github.com/cevr/effect-oxlint/commit/504175ae5a779769bc9c34853156fbce8b3fbe92) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `noModulePathFacts`: a module's file path comes from the Effect `Path` service's `Path.fromFileUrl(new URL("./x.ts", import.meta.url))`. It reports the host path facts `import.meta.dirname`, `import.meta.filename`, `import.meta.dir` and `import.meta.path`; `.pathname` read off a `new URL(...)` that takes `import.meta.url` as any argument, inline or held in a `const`; and `.slice`, `.substring` or `.replace` on `import.meta.url` or on such a URL's `.href`. A hand-read `pathname` keeps percent-escapes and, on Windows, a leading `/C:`. `import.meta.url` alone, `import.meta.main`, and passing the URL to any function stay allowed. Host adapter files turn the rule off with an override.

- [`f4c4f6a`](https://github.com/cevr/effect-oxlint/commit/f4c4f6a53415529556c805b3a43f5be60764db21) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `noRepoTempDirectory`: a test's temp directory lives in the system temp directory. A temp directory under the repo that a killed test leaves behind is linted and scanned as source, and parallel runs share it. In test code it reports a temp directory call (`mkdtemp`, `mkdtempSync`, `makeTempDirectory`, `makeTempDirectoryScoped`) whose argument, or options object, roots it in the repo (`import.meta.dir`, `import.meta.dirname`, `__dirname`, `process.cwd()`, a `join`/`resolve` of a relative literal, a relative `directory` literal, or a `const`/`let` bound to one); a node `mkdtemp` with a relative prefix such as `mkdtempSync("case-")`; and a repo path joined to a `tmp`/`temp` segment (`join(import.meta.dir, ".tmp")`).

- [`71b98b5`](https://github.com/cevr/effect-oxlint/commit/71b98b5b2d079d4bcff8a70d1ffa3c78b2d54b5a) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `noSharedTestHome`: a test's home, data and working directory are its own. A fixed path under the shared temp root (`/tmp`, `/var/tmp`, `/private/tmp`, `/dev/shm`, or `tmpdir()`) given to a home key is shared by every run and parallel suite, so a result depends on run order. The rule reads the value of an object property, JSX attribute, binding, parameter default, class field or assignment (`process.env.HOME = "/tmp"`) named `home`, `HOME`, `homeDir`, `homeDirectory`, `dataDir`, `cwd` or any `…Cwd`, plus the names the `keys` option adds, and reports it unless the value makes a unique directory (`mkdtemp*`, `makeTempDirectory*`). Test code is read whole; other files only inside a test layer (`static Test`, a `…TestLayer` binding, a `Test:` key).

- [`b34fd73`](https://github.com/cevr/effect-oxlint/commit/b34fd7329c70fc68c2c31a0ba1916636abf55979) Thanks [@cevr](https://github.com/cevr)! - New recommended rule `requireForceKillAfter`: every `ChildProcess.make` command names `forceKillAfter`. When a child's scope closes, the platform spawner sends SIGTERM, waits one second, and then waits for exit with no bound unless `forceKillAfter` is set, so a child that ignores SIGTERM holds its scope open forever. The rule reads `make` from `effect/process` (`ChildProcess.make`, `P.ChildProcess.make`) and `effect/process/ChildProcess` (a namespace or the named `make` under any alias). It reports a command with no options, an options object literal (inline, held in a `const`, or spread from one) without `forceKillAfter`, and the bare template form ``make`cmd` ``, which cannot carry options; write ``make({ forceKillAfter: "5 seconds" })`cmd` ``. Options it cannot see, such as a parameter, stay allowed.

## 0.24.0

### Minor Changes

- [`7402ac5`](https://github.com/cevr/effect-oxlint/commit/7402ac520097075513e30543e2c5a6f12252b9fe) Thanks [@cevr](https://github.com/cevr)! - `noGlobals` takes a `builtins` option. `builtins: false` drops the built-in list of banned globals and keeps only the `members` bans, so a plain script that may use `console`, `process.env` and `Bun` directly can still ban specific members: `{ "builtins": false, "members": { "Bun": { "properties": ["Glob"], "use": "Effect FileSystem" } } }` reports `Bun.Glob` in every spelling the rule follows (`globalThis["Bun"].Glob`, an alias) and nothing else. The default, `true`, keeps today's behavior.

## 0.23.0

### Minor Changes

- [`5d50805`](https://github.com/cevr/effect-oxlint/commit/5d50805f3411d4ab732da36d7457f2cbf8194b50) Thanks [@cevr](https://github.com/cevr)! - `noNewPromise` follows the global `Promise` as `noGlobals` follows the globals it bans, through one shared walk. It reports `new globalThis.Promise()`, `new globalThis["Promise"]()`, `new self.Promise()`, `globalThis.Promise.all([])`, `Promise["resolve"](1)`, `new (Promise as PromiseConstructor)()`, an alias (`const P = Promise; new P()`) and a destructure (`const { resolve } = Promise; resolve(1)`, `const { Promise: { all } } = globalThis`). A local binding named `Promise` is no longer reported, and an alias that is reassigned to another value is not followed. Code that passed only because of the spelling now reports.

### Patch Changes

- [`0ff27ce`](https://github.com/cevr/effect-oxlint/commit/0ff27ce55acde1aaaf82633bcf60b93076c84663) Thanks [@cevr](https://github.com/cevr)! - `noPlatformLayerOutsideEntry` reports a non-layer member of a platform module that a file exports: `export const socket = BunSocket.makeNet`, `export const { runMain } = BunRuntime`, `export default BunSocket.makeNet`, a named import exported again (`import { makeNet } from "@effect/platform-bun/BunSocket"; export const socket = makeNet`), and each of these through a local alias or an `export { name }` list. Every importer of such an export reaches the platform package where no rule follows it. A member used in place (`BunRuntime.runMain(program)`, `BunSocket.makeNet(options)`) is still not reported.

## 0.22.0

### Minor Changes

- [`6abf56f`](https://github.com/cevr/effect-oxlint/commit/6abf56f0811fbabaff3b22958fc6330034fc7ba8) Thanks [@cevr](https://github.com/cevr)! - `noGlobals` follows a global's value instead of matching one syntax shape. It reports a banned global read through the global object (`globalThis.fetch()`, `new globalThis.Date()`, `self.setTimeout()`, `globalThis.process.env`), through a computed string member (`process["env"]`, ``console[`log`]``), through `as`/`!`/`satisfies`/`?.`, and through an alias or destructure (`const { env } = process`, `const p = process; p.env`, `const D = Date; new D()`, `const { process: p } = globalThis`, `const { process: { env } } = globalThis`). An alias is followed only while every write to it stores the same global, so `let p = process; p = local; p.env` does not report, and an alias cycle ends. A global the `members` option bans whole (`{ "Bun": { "use": "..." } }`) is reported wherever its value leaves the rule's sight, such as `use(Bun)` or `const { ...rest } = Bun`. Code that passed only because of the spelling now reports.

### Patch Changes

- [`e4772e2`](https://github.com/cevr/effect-oxlint/commit/e4772e2435433ea36605a8b33567d65fd5a33708) Thanks [@cevr](https://github.com/cevr)! - `noPlatformLayerOutsideEntry` reports a platform package or module exported as the value of a declaration: `export const Fs = BunFileSystem`, `export let P = Platform`, `export const Fs = Platform.BunFileSystem`, `export const { BunPath } = Platform`, and an exported alias of an alias. The exported binding has no reads in its own file, so the rule could not follow it to a `layer` read.

## 0.21.1

### Patch Changes

- [`8c04f25`](https://github.com/cevr/effect-oxlint/commit/8c04f25b58fc7dbf6c37ddddc3710b0a13e3bec2) Thanks [@cevr](https://github.com/cevr)! - `noEffectRunInTests` reports a runner read through a computed key that names it: a string literal or template (`runtime["runPromise"]`) or a const bound to one (`const runPromise = "runPromise"; runtime[runPromise]`). `noTimeoutDieInTests` reads a die message through `satisfies`, `as`, `<T>`, `!` and parentheses (`Effect.die({ message: "timed out" satisfies string })`).

## 0.21.0

### Minor Changes

- [`b0335aa`](https://github.com/cevr/effect-oxlint/commit/b0335aaa42c08507ceedfd30662aace158aa5227) Thanks [@cevr](https://github.com/cevr)! - Requires Effect 4.0.0. The peer range is now `>=4.0.0 <5`. `noUnboundedRetry` recognizes HttpClient imported from `effect/http/HttpClient`, and `noNodeBuiltinImport` points at `effect/process`, `effect/http` and `effect/workers`, the Effect 4.0.0 homes of the former `effect/unstable/*` modules.

## 0.20.0

### Minor Changes

- [`e49007e`](https://github.com/cevr/effect-oxlint/commit/e49007e413de31452deede85d679b3159134fbbd) Thanks [@cevr](https://github.com/cevr)! - Test rules close five gaps, and `noWithWrapperCall` can narrow its test exemption.
  - `effect/noEffectRunInTests` reports a runner method on any runtime value in test code (`runtime.runPromise(...)`, `ui.clientRuntime.runPromiseExit(...)`, `program.pipe(runtime.runPromise)`, `runtime.runSync(...)`), called or passed as a reference. A boundary file keeps its override.
  - `effect/noWithWrapperCall` takes `testFiles`: globs that replace the test definition for its callback-helper exemption alone. With `{ "testFiles": ["**/tests/**"] }`, only files under a `tests/` tree keep `withX(callback)` helpers; shared harness code that `effect.testFiles` counts as test code is held to the rule. Without the option the exemption is unchanged.
  - `effect/noFixedWaitInTests` reports each sleep inside a waited expression: piped, raced, sequenced, or bound to a result (`yield* settled.pipe(Effect.raceFirst(Effect.sleep(...)))`, `await Promise.race([Bun.sleep(10), ...])`). A sleep inside a nested function, such as a mock's `read: () => Effect.sleep(...)`, stays allowed.
  - `effect/noFixedWaitInTests` reports a sleep stored under a name, in a variable's initializer or an object field (`const pause = Effect.sleep(...)`, `{ settle: Effect.sleep(...) }`), since a later `yield* pause` waits on it. A stored forked sleep is reported too. A real-clock fence the subject needs takes a reasoned line suppression.
  - `effect/noTimeoutDieInTests` reads a die's message inside object and array payloads, so `Effect.die(new WaitForError({ message: "timed out ..." }))` and `Effect.die({ reason: "gave up ..." })` are reported.

## 0.19.0

### Minor Changes

- [`492b3ed`](https://github.com/cevr/effect-oxlint/commit/492b3edab0c4c5c2a01f95c042869be9cfa9744e) Thanks [@cevr](https://github.com/cevr)! - Stricter tagged unions, a strict dynamic-import mode, project bans for runtime adapters, and an opt-in platform layer rule.
  - `effect/preferSchemaTaggedUnion` reports `_tag` unions of any tag case. Lowercase and kebab-case tags (`{ _tag: "tool-call" } | { _tag: "text-delta" }`) were exempt; declare them with `Schema.TaggedStruct` variants joined by `Schema.toTaggedUnion`. A single tagged object, alone or beside `undefined`, is still not reported.
  - `effect/noDynamicImports` takes `allowNamedBoundaries: false`, which reports every `import()`, named or not; a deliberate load keeps a reasoned line suppression. The default is unchanged.
  - `effect/noGlobals` takes `members` (more members of a global to ban, all of them or the listed `properties`), and `effect/noNodeBuiltinImport` takes `modules` (more modules to ban, such as `bun`, `bun:*` or `os`, whole or only for listed `members`). Adapter files keep an override. The built-in bans are unchanged.
  - Opt-in `effect/noPlatformLayerOutsideEntry`: a `layer*` export of a platform package (`@effect/platform-bun`, `-node`, `-node-shared`, `-browser`, or the `packages` option) is provided only in the entry files an override exempts. It follows imports, `import()`, aliases and destructures, and reports a platform module handed on and a re-export of a platform package. `layers` names a project's own platform layers.

## 0.18.0

### Minor Changes

- [`1067cca`](https://github.com/cevr/effect-oxlint/commit/1067ccae29fffea3377f2b90966f539b28f5f06d) Thanks [@cevr](https://github.com/cevr)! - Add rules ported from gent's lint plugin, and a shared test-file setting.

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

- [`e3a5080`](https://github.com/cevr/effect-oxlint/commit/e3a5080ec727e2d69afbafec8b439d8a3b2d61e1) Thanks [@cevr](https://github.com/cevr)! - Add `effect/noFixedWaitInTests`: a test file may not block on wall-clock time. It reports a waited `Effect.sleep`, `Bun.sleep`/`Bun.sleepSync`, or `setTimeout` from `timers/promises`, any `waitForTimeout(...)`, and a `new Promise` that only `setTimeout` settles. A sleep used as a value (a fake's latency, a forked fiber under `TestClock`) stays allowed. The message points to `TestClock.adjust` or waiting on the event (Deferred, Latch, Queue, `expect.poll`, `waitForFunction`).

## 0.17.1

### Patch Changes

- [`8a39b4c`](https://github.com/cevr/effect-oxlint/commit/8a39b4c6346c9941b8573e0fbb6c4bd84c713aa4) Thanks [@cevr](https://github.com/cevr)! - `presets/recommended.json` declares `"plugins": []`. Without it, oxlint 1.86 gave a config that extends the preset oxlint's default plugins (unicorn, oxc, ...) on top of its own `plugins`, so rules such as `unicorn/consistent-function-scoping` and `unicorn/no-array-sort` fired in projects that never enabled unicorn. The extending config's `plugins` list now decides the built-in plugins.

## 0.17.0

### Minor Changes

- [`884e8f7`](https://github.com/cevr/effect-oxlint/commit/884e8f78b6ef63a66f50412e05f85049da5ef4e6) Thanks [@cevr](https://github.com/cevr)! - `noUnboundedRetry` and `noUnboundedConcurrency` now follow values held in `const` bindings, through `as const`, `satisfies`, and `!`. A schedule, a retry policy, a `Schedule.take` or `Schedule.recurs` bound, an options object, or a `"unbounded"` value in a named const is checked like the inline value. Parameters and `let` bindings stay unreported.

  Both rules now report the whole retry or collection call, not the schedule or `"unbounded"` value inside it. A `// oxlint-disable-next-line` comment goes above the call line, whatever the shape of its arguments. Move existing suppressions that sit inside a multi-line options object.

## 0.16.1

### Patch Changes

- [`402d496`](https://github.com/cevr/effect-oxlint/commit/402d496d3c0de8a07c56d2f07547b7fba69c554d) Thanks [@cevr](https://github.com/cevr)! - `preferPredicateIsTagged` and `preferMatchTagsExhaustive` now report only in files that import `effect`, an `effect/` subpath, or an `@effect/` package. Their fixes need `Predicate` or `Match`, so a plain TypeScript file with `_tag` unions is no longer reported.

## 0.16.0

### Minor Changes

- [`afdd060`](https://github.com/cevr/effect-oxlint/commit/afdd06093923bbc832f749a5714079472903cd06) Thanks [@cevr](https://github.com/cevr)! - Ship the recommended preset as `presets/recommended.json`. JSON oxlint configurations extend it instead of copying the rule map, so new rules reach them with each release.

## 0.15.0

### Minor Changes

- [`3e06227`](https://github.com/cevr/effect-oxlint/commit/3e062277baca2a8efe87ec74a009712d3a94def8) Thanks [@cevr](https://github.com/cevr)! - Extend `effect/noModuleMocks` to bun:test and to every mock-double entry point. It now reports `mock.module()`, bare `mock()`, and bare `spyOn()` bound to `bun:test`, plus `fn`, `doMock`, `mocked`, and `unmock` on `vi` and `jest` from `vitest`, `@jest/globals`, `bun:test`, or the unshadowed runner globals. `vi.fn()` and `jest.fn()` were previously allowed and are now reported.

  Add `effect/noTestGlobals` to the recommended preset. In test files (`*.test.*`, `*.spec.*`) it reports writes (assignment, update, and `delete`) to `globalThis`, `window`, `global`, `self`, and `process.env`; `Reflect.set`/`defineProperty`/`deleteProperty` and `Object.assign`/`defineProperty`/`defineProperties` on those objects; `vi.stubGlobal`, `vi.stubEnv`, `vi.unstubAllGlobals`, `vi.unstubAllEnvs`, and `jest.replaceProperty`; and any runner global such as `describe`, `it`, `expect`, or `beforeEach` that no import provides.

## 0.14.0

### Minor Changes

- [#31](https://github.com/cevr/effect-oxlint/pull/31) [`8ef79e5`](https://github.com/cevr/effect-oxlint/commit/8ef79e5dd27d38362504a321435c36cf7b554fc2) Thanks [@cevr](https://github.com/cevr)! - Add ten rules to the recommended preset, all at `error`:
  - `noModuleLevelMutableState` bans module-level `let` and `var` outside test files; keep request-shared state in a `Ref` owned by a Layer.
  - `noEagerAcquire` bans `Effect.acquireRelease` acquires that build or capture the resource before acquire runs (`Effect.succeed(handle)`, `Effect.sync(() => capturedHandle)`).
  - `noEffectRunInTests` bans `Effect.run*` and `ManagedRuntime.make` in test files; use `it.effect` or `it.layer`.
  - `requireSuppressionReason` requires every oxlint, ESLint, `@effect-diagnostics`, and `@ts-*` suppression to name what it disables and give a reason after `--`, and rejects `effect/`-prefixed `@effect-diagnostics` rule names.
  - From anti-slop: `noArrayFilterMap`, `noReduceAccumulatorCopy`, `noReflectApply`, `noReflectGet`, and `noUnknownReturns`.

  The vendored anti-slop rules now include upstream bug fixes through `c44ef22`: lexical type alias resolution, literal-keyed `Record`s treated as closed, `unknown` detected inside unions, type-guard subjects and promise rejection reasons exempt from `noUnknownParameters`, `typeof` existence probes allowed, borrowed `shape` members allowed, type parameter constraints exempt from `noUnsafeDictionaryType`, and no semantics-changing autofix in `noConditionalEmptyObjectSpread`.

## 0.13.0

### Minor Changes

- [`f29c630`](https://github.com/cevr/effect-oxlint/commit/f29c63041b7e793530b2bfd489fb694528b34765) Thanks [@cevr](https://github.com/cevr)! - `noAs` allows `as const`: it narrows a literal to its own readonly type and asserts nothing, so it has no `satisfies` equivalent.

## 0.12.1

### Patch Changes

- [#28](https://github.com/cevr/effect-oxlint/pull/28) [`4a0fafa`](https://github.com/cevr/effect-oxlint/commit/4a0fafac26116417c20ba755d7e609c49369a8a0) Thanks [@cevr](https://github.com/cevr)! - Allow `null` as the prototype argument in `Object.create(null)`.

## 0.12.0

### Minor Changes

- [#26](https://github.com/cevr/effect-oxlint/pull/26) [`3b5e2df`](https://github.com/cevr/effect-oxlint/commit/3b5e2dfb43435ef7f8940e2464063990ab936c4e) Thanks [@cevr](https://github.com/cevr)! - Cap function complexity in the recommended preset. The preset now enables the native oxlint `complexity` rule (cyclomatic, max 21) and two new plugin rules: `effect/maxCognitiveComplexity` (SonarSource cognitive complexity, max 21) and `effect/maxHalsteadDifficulty` (Halstead difficulty, max 79). Both rules accept `{ max }`. Rule metadata can declare `recommendedOptions`, which the generated preset publishes as `["error", options]`.

## 0.11.0

### Minor Changes

- [`f38a253`](https://github.com/cevr/effect-oxlint/commit/f38a253911cf2d977b9fef60098889df2514ccf1) Thanks [@cevr](https://github.com/cevr)! - Expand Effect program design guidance. Detect manual tagged control flow, unchecked inline service implementations, hidden provisioning, nested generators, unnamed operations, discarded serial aggregation, silent failure erasure, per-call cache construction, unbounded stream collection, unbounded concurrency, unbounded retry schedules, and nested `ManagedRuntime` construction.

## 0.10.0

### Minor Changes

- [#23](https://github.com/cevr/effect-oxlint/pull/23) [`8766ebf`](https://github.com/cevr/effect-oxlint/commit/8766ebfd0cb88ad884987f5c3187193be2578846) Thanks [@cevr](https://github.com/cevr)! - Add `effect/noModuleMocks` to guide Vitest and Jest tests toward Effect service test layers.

## 0.9.0

### Minor Changes

- [#21](https://github.com/cevr/effect-oxlint/pull/21) [`1e651e1`](https://github.com/cevr/effect-oxlint/commit/1e651e199603f2f650baf90c306b40fa3b60afbb) Thanks [@cevr](https://github.com/cevr)! - Add rules that guide tagged values toward `Predicate` and exhaustive `Match`, and guide tagged failures toward `Effect.catchTag` or `Effect.catchTags`.

## 0.8.2

### Patch Changes

- [#19](https://github.com/cevr/effect-oxlint/pull/19) [`a4b6c4c`](https://github.com/cevr/effect-oxlint/commit/a4b6c4c3a80bee2a9054abc9a81a0cd60d3c3daf) Thanks [@cevr](https://github.com/cevr)! - Detect traced generators in multi-step pipes and resolve Effect namespace import aliases.

## 0.8.1

### Patch Changes

- [#17](https://github.com/cevr/effect-oxlint/pull/17) [`15ef66b`](https://github.com/cevr/effect-oxlint/commit/15ef66b0d1433ead22cd05bb0f37c9188414572a) Thanks [@cevr](https://github.com/cevr)! - Keep public build entries and generated rule surfaces explicit.

  Make the rule scaffolder produce the established Effect-first rule pattern.

## 0.8.0

### Minor Changes

- [#15](https://github.com/cevr/effect-oxlint/pull/15) [`8204f54`](https://github.com/cevr/effect-oxlint/commit/8204f549545378565e7a8104e0e6f398b8a4fba6) Thanks [@cevr](https://github.com/cevr)! - Add a rule that prefers `Effect.fn` over a spanned `Effect.gen` operation.

  Add the anti-slop rule set with source attribution.

## 0.7.0

### Minor Changes

- [`d4b5cbf`](https://github.com/cevr/effect-oxlint/commit/d4b5cbf82d6256f58f4a52e97e46ffdc19ff893b) Thanks [@cevr](https://github.com/cevr)! - Add the recommended `effect/noNullish` rule for Option-first domain modeling.

## 0.6.0

### Minor Changes

- [#12](https://github.com/cevr/effect-oxlint/pull/12) [`bbe1ca5`](https://github.com/cevr/effect-oxlint/commit/bbe1ca54e2cc54d7f0137be75fdf5d549fa91fd8) Thanks [@cevr](https://github.com/cevr)! - Add `effect/noAs` to the recommended preset. Ban TypeScript `as` assertions in favor of `satisfies` expressions.

## 0.5.1

### Patch Changes

- [`8633093`](https://github.com/cevr/effect-oxlint/commit/8633093b3be0ac124320588b8c28c69203abbbe3) Thanks [@cevr](https://github.com/cevr)! - Allow `process.stdout.isTTY`, `process.stderr.isTTY`, and `process.stdin.isTTY` reads in `effect/noGlobals`. No Effect service exposes TTY detection; every other use of the process streams stays banned.

## 0.5.0

### Minor Changes

- [`fd2dfd6`](https://github.com/cevr/effect-oxlint/commit/fd2dfd6dc263947f2b997754c8e64661975e316d) Thanks [@cevr](https://github.com/cevr)! - Ban test lifecycle hooks in the recommended preset. Use Effect scopes and scoped test variants for fixture acquisition and release.

## 0.4.0

### Minor Changes

- [#7](https://github.com/cevr/effect-oxlint/pull/7) [`acfc8d4`](https://github.com/cevr/effect-oxlint/commit/acfc8d4bb34b1b564d8b03dc705bffbe08b5edc4) Thanks [@cevr](https://github.com/cevr)! - Replace the legacy preset matrix with one strict `recommended` preset for Effect-native application code. The maintained AST-only rules now ban imperative failure handling, Promise control flow, ternaries, inline dynamic imports, and runtime capabilities that have direct Effect replacements while preserving explicit defect, lazy-loading, and platform-adapter boundaries.

## 0.3.0

### Minor Changes

- [`ef0ee31`](https://github.com/cevr/effect-oxlint/commit/ef0ee3120fe7f37e0cad751ef65b8fcd0b75c245) Thanks [@cevr](https://github.com/cevr)! - Ban every try statement explicitly and add rules for schema-bypassing data guards and sequential stateful Effect.all steps.

## 0.2.3

### Patch Changes

- [`6c5aa7d`](https://github.com/cevr/effect-oxlint/commit/6c5aa7d6cb93ff361f8394b0b510de22d4c9297a) Thanks [@cevr](https://github.com/cevr)! - Simplify the project to a single oxlint plugin package, remove the tsgolint fork/workspace, expose rule authoring bindings, and add generic Effect lint rules for unsafe constructors, hand-rolled tagged unions, dynamic imports, promise-style test control flow, fixed sleeps in tests, spread syntax, and Schema.Struct usage.

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
