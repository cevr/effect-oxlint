import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

// Cases ported from each rule's upstream test in K-Mistele/anti-slop at b7c1619
// (src/effect/rules/<rule>.test.ts, src/martinfowler/rules/<rule>.test.ts,
// src/rules/no-reprovide-ambient-service.test.ts).
describe("Effect rules ported from anti-slop", () => {
  test("requireCauseWhenNarrowing", () => {
    const results = lintCases("requireCauseWhenNarrowing", {
      valid: [
        '\n\timport * as Effect from "effect/Effect";\n\n\t\tconst a = decode(text).pipe(Effect.mapError((cause) => BadRequest.make({ reason: "Invalid JSON", cause })));\n\t\tconst b = decode(text).pipe(Effect.mapError((error) => new BadRequest({ reason: error.message })));\n\t\tconst c = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON", ...details })));',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\tconst a = decode(text).pipe(Effect.tapError(Effect.logError), Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));\n\t\tconst b = Effect.fn("decode")(function* () {}, Effect.tapCause(Effect.logError), Effect.catch(() => Effect.fail(new Failed())));\n\t\tconst c = Effect.mapError(Effect.tapErrorCause(decode(text), Effect.logError), () => new Failed());',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\tconst a = load.pipe(Effect.catchTag("NotFound", () => Effect.fail(new Missing())));\n\t\tconst b = load.pipe(Effect.catchTags({ NotFound: () => Effect.fail(new Missing()) }));',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\tconst a = load.pipe(Effect.orElse(() => Effect.succeed(new Fallback())));\n\t\tconst b = load.pipe(Effect.catch(() => Effect.sync(() => new Fallback())));\n\t\tconst c = load.pipe(Effect.catch(() => Effect.succeed(Option.make(1))));',
        '\n\t\timport * as Effect from "other-library";\n\t\tconst a = load.pipe(Effect.mapError(() => new Failed()));',
      ],
      invalid: [
        '\n\timport * as Effect from "effect/Effect";\n\n\t\t\tconst a = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\t\tconst a = Effect.mapError(decode(text), (_error) => new McpDialFailed({ message: "bad frame" }));',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\t\tconst a = read.pipe(Effect.catch(() => AuthUnavailable.make({ error: "unavailable" })));\n\t\t\tconst b = read.pipe(Effect.catchAll(() => Effect.fail(new Unavailable())));\n\t\t\tconst c = read.pipe(Effect.orElse(() => Effect.gen(function* () {\n\t\t\t\treturn yield* new Unavailable({ reason: "down" });\n\t\t\t})));\n\t\t\tconst d = read.pipe(Effect.catchCause(() => { return Effect.fail(Errors.Unavailable.make()); }));',
        '\n\timport * as Effect from "effect/Effect";\n\n\t\t\tconst a = read.pipe(Effect.tapError(Effect.logError)).pipe(Effect.map(f), Effect.mapError(() => new Failed()));\n\t\t\tconst b = read.pipe(Effect.mapError(() => new Failed()), Effect.tapError(Effect.logError));',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noOrdieInServiceConstruction", () => {
    const results = lintCases("noOrdieInServiceConstruction", {
      valid: [
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class Store extends Context.Service<Store, StoreShape>()("@app/Store", {\n\t\t\tmake: Effect.gen(function* () {\n\t\t\t\tconst sql = yield* Sql;\n\t\t\t\treturn {\n\t\t\t\t\tfind: (id: string) => Effect.gen(function* () {\n\t\t\t\t\t\treturn yield* sql.find(id).pipe(Effect.orDie);\n\t\t\t\t\t}),\n\t\t\t\t\tlist: Effect.orDie(sql.list),\n\t\t\t\t};\n\t\t\t}),\n\t\t}) {\n\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class Store extends Context.Service<Store, StoreShape>()("@app/Store", {\n\t\t\tmake: Effect.gen(function* () {\n\t\t\t\tconst find = Effect.fn("Store.find")(function* (id: string) {\n\t\t\t\t\treturn yield* lookup(id).pipe(Effect.orDie);\n\t\t\t\t});\n\t\t\t\tconst unwrap = Effect.fnUntraced(function* (id: string) { return id; }, Effect.orDie);\n\t\t\t\tconst collect = Stream.runCollect(entries).pipe(Effect.orDie);\n\t\t\t\treturn { find, unwrap, collect };\n\t\t\t}),\n\t\t}) {\n\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\tconst program = Effect.gen(function* () {\n\t\t\tyield* risky.pipe(Effect.orDie);\n\t\t});',
        '\n\t\timport * as Layer from "other-library";\n\t\tconst layer = live.pipe(Layer.orDie);',
      ],
      invalid: [
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Client extends Context.Service<Client, ClientShape>()("@app/Client", {\n\t\t\t\tmake: Effect.gen(function* () {\n\t\t\t\t\tconst token = yield* Config.string("TOKEN").pipe(Effect.orDie);\n\t\t\t\t\treturn { token };\n\t\t\t\t}),\n\t\t\t}) {\n\t\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Client extends Context.Service<Client, ClientShape>()("@app/Client", {\n\t\t\t\tmake: Effect.gen(function* () {\n\t\t\t\t\treturn {};\n\t\t\t\t}).pipe(Effect.orDieWith((error) => error)),\n\t\t\t}) {\n\t\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Database extends Context.Service<Database, DatabaseShape>()("@app/Database") {\n\t\t\t\tstatic readonly make = (file: string) => Effect.gen(function* () {\n\t\t\t\t\tyield* migrate(file).pipe(Effect.orDie);\n\t\t\t\t\treturn {};\n\t\t\t\t});\n\t\t\t\tstatic readonly layer = (file: string) => Layer.effect(this, this.make(file));\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport const live = Layer.effect(Store, Effect.gen(function* () {\n\t\t\t\tconst key = yield* Effect.suspend(() => loadKey.pipe(Effect.orDie));\n\t\t\t\treturn { key };\n\t\t\t}));',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tconst logLayer = layerJsonl(path).pipe(Layer.orDie);',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noOrdieInServiceConstruction by file name", () => {
    expect(
      lintFixtures("noOrdieInServiceConstruction", {
        "store.test.ts":
          '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tconst layer = Store.layer.pipe(Layer.orDie);',
      }).get("store.test.ts") ?? [],
    ).toEqual([]);
  });
  test("preferYieldService", () => {
    const results = lintCases("preferYieldService", {
      valid: [
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\tconst make = Effect.gen(function* () {\n\t\t\tconst fs = yield* FileSystem;\n\t\t\treturn { read: (path: string) => fs.read(path) };\n\t\t});',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\tconst make = Effect.gen(function* () {\n\t\t\tconst context = yield* Effect.context<Store>();\n\t\t\treturn { onMessage: (message: Message) => Effect.runForkWith(context)(handle(message)) };\n\t\t});',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\tconst make = Effect.gen(function* () {\n\t\t\tconst services = yield* Effect.context<Store>();\n\t\t\tconst store = Context.get(services, Store);\n\t\t\treturn { store };\n\t\t});',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\tconst make = Effect.gen(function* () {\n\t\t\tconst services = yield* Effect.context<Store>();\n\t\t\treturn { run: work.pipe(Effect.provide(Store.layer)), services };\n\t\t});',
        '\n\t\timport * as Effect from "other-library";\n\t\tconst make = Effect.gen(function* () {\n\t\t\tconst services = yield* Effect.context();\n\t\t\treturn work.pipe(Effect.provide(services));\n\t\t});',
      ],
      invalid: [
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tconst make = Effect.gen(function* () {\n\t\t\t\tconst fileAccess = yield* Effect.context<FileSystem | Path>();\n\t\t\t\treturn { build: (dir: string) => runBuild(dir).pipe(Effect.provideContext(fileAccess)) };\n\t\t\t});',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tconst make = Effect.gen(function* () {\n\t\t\t\tconst services = yield* Effect.context<Store | Crypto>();\n\t\t\t\treturn { process: Effect.provide(process, services) };\n\t\t\t});',
        '\n\t\t\timport { Effect, Layer } from "effect";\n\t\t\tconst layer = Layer.unwrap(Effect.gen(function* () {\n\t\t\t\tconst context = yield* Effect.context<Store>();\n\t\t\t\treturn Live.pipe(Layer.provide(context as never));\n\t\t\t}));',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tconst layer = Layer.unwrap(Effect.gen(function* () {\n\t\t\t\tconst context = yield* Effect.context<Store>();\n\t\t\t\treturn Live.pipe(Layer.provide(Layer.succeedContext(context)));\n\t\t\t}));',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noReprovideAmbientService", () => {
    const results = lintCases("noReprovideAmbientService", {
      valid: [
        "\n        import { Effect } from 'effect'\n        import * as HttpClient from 'effect/unstable/http/HttpClient'\n        const operation = Effect.gen(function* () {\n          yield* HttpClient.HttpClient\n        })\n      ",
        "\n        import { Effect } from 'effect'\n        const operation = Effect.gen(function* () {\n          const first = yield* FirstService\n          return Effect.provideService(request, SecondService, first)\n        })\n      ",
        "\n        import { Effect } from 'effect'\n        import * as HttpClient from 'effect/unstable/http/HttpClient'\n        const operation = Effect.gen(function* () {\n          const baseClient = yield* HttpClient.HttpClient\n          const tenantClient = configureForTenant(baseClient)\n          return request.pipe(Effect.provideService(HttpClient.HttpClient, tenantClient))\n        })\n      ",
        "\n        import { Effect } from 'effect'\n        const operation = Effect.gen(function* () {\n          const first = yield* FirstService\n          return request.pipe(Effect.provideService(SecondService, first))\n        })\n      ",
        "\n        import { Effect } from 'other-library'\n        const operation = Effect.gen(function* () {\n          const service = yield* Service\n          return request.pipe(Effect.provideService(Service, service))\n        })\n      ",
        // Local change (upstream: invalid). A method built in a Layer's
        // construction provides what the construction captured: the Layer
        // idiom, 29 of BL2's 30 Bite reads.
        // Mutant: the same-function check removed (this case is reported).
        "\n        import { Effect } from 'effect'\n        import * as HttpClient from 'effect/unstable/http/HttpClient'\n        const ServiceLive = Layer.effect(Service, Effect.gen(function* () {\n          const httpClient = yield* HttpClient.HttpClient\n          return Service.of({\n            execute: () => request.pipe(\n              Effect.provideService(HttpClient.HttpClient, httpClient),\n            ),\n          })\n        }))\n      ",
      ],
      invalid: [
        // Mutant: the check compares the wrong functions (never equal): this is missed.
        "\n        import { Effect } from 'effect'\n        const ServiceLive = Layer.effect(Service, Effect.gen(function* () {\n          const store = yield* Store\n          yield* warm.pipe(Effect.provideService(Store, store))\n          return Service.of({})\n        }))\n      ",
        "\n        import * as Fx from 'effect/Effect'\n        import * as HttpClient from 'effect/unstable/http/HttpClient'\n        const operation = Fx.gen(function* () {\n          const httpClient = yield* HttpClient.HttpClient\n          return request.pipe(Fx.provideService(HttpClient.HttpClient, httpClient))\n        })\n      ",
        "\n        import { Effect } from 'effect'\n        import * as HttpClient from 'effect/unstable/http/HttpClient'\n        const operation = Effect.gen(function* () {\n          const httpClient = yield* HttpClient.HttpClient\n          return Effect.provideService(request, HttpClient.HttpClient, httpClient)\n        })\n      ",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noServiceParameters", () => {
    const results = lintCases("noServiceParameters", {
      valid: [
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\tconst find = (input: { readonly id: string }) => Effect.gen(function* () {\n\t\t\tconst store = yield* Store;\n\t\t\treturn yield* store.find(input.id);\n\t\t});',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\tconst withLogging = <A>(layer: Layer.Layer<A>) => layer.pipe(Layer.provide(Logging.layer));\n\t\tconst merged = (left: Layer.Layer<A>, right: Layer.Layer<B>) => Layer.merge(left, right);\n\t\tfunction provideAll(layer: Layer.Layer<A>): Layer.Layer<A> {\n\t\t\treturn layer;\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\tconst config = Effect.contextWith((context: Context.Context<never>) => Effect.succeed(context));',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\timport { Store } from "./store.ts";\n\t\tconst save = (store: Store) => store;',
        '\n\t\timport * as Context from "other-library";\n\t\tconst run = (context: Context.Context) => context;',
        // Local change (upstream: invalid for the first two). A function at
        // a boundary, not an Effect operation, takes its runtime, context or
        // layer because providing it is its job (BL2's Bite reads: test
        // runners, provide helpers, app and runtime construction).
        // Mutant: isEffectOperation answers true (these are reported).
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tconst runAllow = <R>(allow: Allow<R>, context: Context.Context<R>) => Effect.runPromiseWith(context)(allow);',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tfunction handle(runtime: ManagedRuntime.ManagedRuntime<Store, never>, request: Request) {\n\t\t\t\treturn runtime.runPromise(serve(request));\n\t\t\t}',
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport const provideScoped = <R>(layer: Layer.Layer<R>) => <A>(effect: Effect.Effect<A, never, R>) => Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provide(context)))));\n\t\t\texport async function makeApp(pages: Layer.Layer<Pages>): Promise<App> { return build(pages); }',
      ],
      invalid: [
        // Mutant: a block body's `return Effect…` is not read (this is missed).
        '\n\timport * as Effect from "effect/Effect";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tfunction handle(runtime: ManagedRuntime.ManagedRuntime<Store, never>) {\n\t\t\t\treturn Effect.promise(() => runtime.runPromise(serve()));\n\t\t\t}',
        // Mutant: a declared Effect return type is not read (this is missed).
        '\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\tfunction enqueue(job: Job, queue: Layer.Layer<Queue>): Effect.Effect<void> {\n\t\t\t\treturn send(job, queue);\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tconst operation = (input: Input, layer: Layer.Layer<Store>) => run(input).pipe(Effect.provide(layer));',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\texport class Store extends Context.Service<Store, StoreShape>()("@app/Store") {}\n\t\t\tconst save = (store: Store, value: string) => store.save(value);\n\t\t\tclass Worker { run(store: Store) {} }',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tinterface Operations {\n\t\t\t\treadonly run: (context: Context.Context<Store>) => Effect.Effect<void>;\n\t\t\t\texecute(runtime: ManagedRuntime.ManagedRuntime<Store, never>): void;\n\t\t\t}',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noServiceParameters by file name", () => {
    expect(
      lintFixtures("noServiceParameters", {
        "store.test.ts":
          '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\timport * as ManagedRuntime from "effect/ManagedRuntime";\n\n\t\t\tconst run = (context: Context.Context<Store>) => context;',
      }).get("store.test.ts") ?? [],
    ).toEqual([]);
  });
  test("noServiceConstructorImports", () => {
    const results = lintCases("noServiceConstructorImports", {
      valid: [],
      invalid: [],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noServiceConstructorImports by file name", () => {
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/issue-service.test.ts": 'import { makeIssueService } from "./issue-service.ts";',
      }).get("src/issue-service.test.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/issue-service.spec.tsx": 'import { makeIssueService } from "../issue-service.ts";',
      }).get("src/issue-service.spec.tsx") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/runtime.ts": 'import { makeExecutionMemo } from "alchemy/Runtime/ExecutionMemo";',
      }).get("src/runtime.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/runtime.ts":
          'import { issueServiceLayer } from "./issue-service.ts";\nWorkspaceName.make("name");',
      }).get("src/runtime.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/runtime.ts": 'import { makeissueService } from "./issue-service.ts";',
      }).get("src/runtime.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/runtime.ts": 'import { makeIssueService } from "./issue-service.ts";',
      }).get("src/runtime.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures("noServiceConstructorImports", {
        "src/runtime.ts":
          'import { makeIssueService as createIssueService } from "../issue-service.ts";',
      }).get("src/runtime.ts") ?? [],
    ).not.toEqual([]);
  });
  test("noTestCodeInSrc", () => {
    const results = lintCases("noTestCodeInSrc", {
      valid: [],
      invalid: [],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noTestCodeInSrc by file name", () => {
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          "export const layer = Widgets.layer;\nexport const hitTest = (x: number) => x > 0;",
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          "/** Stands in for the billing service until it ships. */\nexport const layerFixtures = Layer.succeed(Billing, fixtures);",
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          "export const TestConnection = () => null;\nexport class Widgets { static readonly layer = live; }",
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          'import { widget } from "./latest/widget.ts";\nimport { helper } from "test-utils";',
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/test/support/layers.ts":
          'export const layerTest = Widgets.layer;\nimport { x } from "../../test/x.ts";',
      }).get("repo/packages/widgets/test/support/layers.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/test/widgets.test.ts": "export const FakeClock = {};",
      }).get("repo/packages/widgets/test/widgets.test.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "noTestCodeInSrc",
        { "repo/packages/widgets/src/widgets.ts": "export const layerTest = Widgets.layer;" },
        { options: [{ sourceDirectories: ["lib"] }] },
      ).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "noTestCodeInSrc",
        { "repo/packages/widgets/src/widgets.ts": "export const WidgetsMock = {};" },
        { options: [{ testNamePatterns: ["^layerTest$"] }] },
      ).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.test.ts": 'it("works", () => {});',
      }).get("repo/packages/widgets/src/widgets.test.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/__tests__/helpers.ts": "export const value = 1;",
      }).get("repo/packages/widgets/src/__tests__/helpers.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          'import { fake } from "../test/support/fakes.ts";\nexport * from "./__tests__/helpers.ts";\nconst lazy = import("../tests/lazy.ts");',
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          "\n\t\t\t\texport const layerTest = Widgets.layer;\n\t\t\t\texport function makeFakeWidgets() {}\n\t\t\t\texport class FakeClock {}\n\t\t\t\texport const WidgetsTestLayer = live;\n\t\t\t\tconst recorder = {};\n\t\t\t\texport { recorder as WidgetsStub };\n\t\t\t",
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures("noTestCodeInSrc", {
        "repo/packages/widgets/src/widgets.ts":
          "export class Widgets { static readonly layerMock = mock; static layerStub() {} }",
      }).get("repo/packages/widgets/src/widgets.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures(
        "noTestCodeInSrc",
        { "repo/lib/widgets.ts": "export const layerTest = Widgets.layer;" },
        { options: [{ sourceDirectories: ["lib"] }] },
      ).get("repo/lib/widgets.ts") ?? [],
    ).not.toEqual([]);
  });
  test("requireServiceMakeLayer", () => {
    const results = lintCases("requireServiceMakeLayer", {
      valid: [
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class AppRegistry extends Context.Service<AppRegistry, { readonly find: () => Effect.Effect<void> }>()("@app/AppRegistry", {\n\t\t\tmake: Effect.gen(function* () {\n\t\t\t\treturn { find: () => Effect.void };\n\t\t\t}),\n\t\t}) {\n\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class Mailbox extends Context.Service<Mailbox, { readonly id: string }>()("@app/Mailbox") {\n\t\t\tstatic readonly make = (options: { readonly id: string }) => Effect.gen(function* () {\n\t\t\t\treturn { id: options.id };\n\t\t\t});\n\t\t\tstatic readonly layer = (options: { readonly id: string }) => Layer.effect(this, this.make(options));\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class Widgets extends Context.Service<Widgets, { readonly id: string }>()("@app/Widgets", {\n\t\t\tmake: Effect.succeed({ id: "w" }),\n\t\t}) {\n\t\t\tstatic readonly layer = Layer.effect(Widgets, Widgets.make).pipe(Layer.provide(Other.layer));\n\t\t\tstatic readonly layerSelfBinding = Widgets.layer.pipe(Layer.provide(selfBinding));\n\t\t\tstatic readonly layerFor = (id: string) => Layer.effect(this, this.make).pipe(Layer.provide(Config.layer(id)));\n\t\t\tstatic readonly layerRouter = HttpRouter.middleware(Effect.succeed(1));\n\t\t\tstatic readonly layerStreams = Layer.effect(Streams, Widgets.use((widgets) => Effect.succeed(widgets)));\n\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport class WorkerBindings extends Context.Service<WorkerBindings, { readonly loader: Loader }>()("@app/WorkerBindings") {}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\texport const live = Layer.effect(AppRegistry, AppRegistry.make);\n\t\texport const configured = Layer.effect(Mailbox, Mailbox.make({ id: "x" }));',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\timport { LanguageModel } from "effect/unstable/ai";\n\t\texport const layer = Layer.effect(LanguageModel.LanguageModel, make(options));',
        '\n\t\timport * as Context from "other-library";\n\t\timport * as Layer from "effect/Layer";\n\t\texport class Plain extends Context.Service<Plain, {}>()("plain") {\n\t\t\tstatic readonly layer = Layer.succeed(this, {});\n\t\t}',
      ],
      invalid: [
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Builds extends Context.Service<Builds, { readonly latest: Effect.Effect<void> }>()("@app/Builds") {\n\t\t\t\tstatic readonly layerWatch = (input: Input) => Layer.effect(this, Effect.gen(function* () { return { latest: Effect.void }; }));\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class SkillsRoot extends Context.Service<SkillsRoot, string>()("@app/SkillsRoot", {\n\t\t\t\tmake: Effect.succeed(""),\n\t\t\t}) {}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Store extends Context.Service<Store, StoreShape>()("@app/Store", {\n\t\t\t\tmake: (impl: StoreShape) => Effect.succeed(impl),\n\t\t\t}) {\n\t\t\t\tstatic readonly layer = (impl: StoreShape) => Layer.succeed(this, impl);\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Client extends Context.Service<Client, ClientShape>()("@app/Client") {\n\t\t\t\tstatic readonly make = makeClient;\n\t\t\t\tstatic readonly layer = (config: Config) => Layer.effect(Client, makeClient(config));\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class Photon extends Context.Service<Photon, PhotonShape>()("@app/Photon", {\n\t\t\t\tmake: Effect.succeed(photon),\n\t\t\t}) {\n\t\t\t\tstatic readonly layer = Layer.effect(this, this.make);\n\t\t\t\tstatic readonly layerUnavailable = (cause: Error) => Layer.succeed(Photon, unavailable(cause));\n\t\t\t}',
        '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\timport { Foo } from "./foo.ts";\n\t\t\texport const FooLive = Layer.effect(Foo, Effect.gen(function* () {\n\t\t\t\treturn { run: () => Effect.void };\n\t\t\t}));',
        '\n\t\t\timport { Context, Effect, Layer } from "effect";\n\t\t\texport class Board extends Context.Service<Board, BoardShape>()("@app/Board") {}\n\t\t\texport const layerBoard = Layer.effect(Board, makeBoard);',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("requireServiceMakeLayer by file name", () => {
    expect(
      lintFixtures("requireServiceMakeLayer", {
        "registry.test.ts":
          '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport const layerTest = Layer.effect(AppRegistry, Effect.gen(function* () { return {}; }));',
      }).get("registry.test.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "requireServiceMakeLayer",
        {
          "options-case.ts":
            '\n\timport * as Context from "effect/Context";\n\timport * as Effect from "effect/Effect";\n\timport * as Layer from "effect/Layer";\n\n\t\t\texport class WorkerBindings extends Context.Service<WorkerBindings, { readonly loader: Loader }>()("@app/WorkerBindings") {}',
        },
        { options: [{ allowTagOnly: false }] },
      ).get("options-case.ts") ?? [],
    ).not.toEqual([]);
  });

  test("mysteriousName", () => {
    const results = lintCases("mysteriousName", {
      valid: [
        "export function loadAndReconcileConfigurationSources() {}",
        "export const getCachedOrAcquireCredential = () => cache.get();",
        "export const handle = openFile(path);",
        "const handle = { close() {} };",
        "export const make = Effect.gen(function* () { return {} });",
        "export function fetch(request: Request) { return respond(request); }",
        "export const layer = Layer.effect(Service, make);",
        "export function syncMailbox() { const run = () => step(); run(); }",
        "export function processRefund() {}",
        "export const runMigrations = Effect.fn('db.runMigrations')(function* () {});",
        "import { load } from './load.ts'; export const loadUser = load;",
        "function a() {} function f() { let current = a; current = b; return current; }",
        "function parseItems(payload) { const raw = payload; return raw; }",
        "const config = readConfig(); export const settings = config;",
      ],
      invalid: [
        "export function resolve() {}",
        "export async function process(input: Input) {}",
        "function handle() {}",
        "export default function execute() {}",
        "export const run = () => step();",
        "export const doWork = async () => {};",
        "const processData = function (rows) {};",
        "export const update = Effect.fn('slots.update')(function* () {});",
        "export const sync = Effect.fn(function* () {});",
        "\n\t\t\t\tfunction refreshAuthentication() {}\n\t\t\t\texport const executeMutation = refreshAuthentication;\n\t\t\t",
        "\n\t\t\t\tconst make = Effect.gen(function* () {\n\t\t\t\t\tconst refreshAuthentication = (id, procedure) => run(id, procedure);\n\t\t\t\t\tconst executeMutation = refreshAuthentication;\n\t\t\t\t\treturn { executeMutation };\n\t\t\t\t});\n\t\t\t",
        '\n\t\t\t\tconst loadSlot = Effect.fn("slot.load")(function* () {});\n\t\t\t\tconst fetchSlot = loadSlot;\n\t\t\t',
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("mysteriousName by file name", () => {
    expect(
      lintFixtures("mysteriousName", { "src/handler.test.ts": "export function handle() {}" }).get(
        "src/handler.test.ts",
      ) ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("mysteriousName", {
        "src/__tests__/handler.ts": "export function handle() {}",
      }).get("src/__tests__/handler.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "mysteriousName",
        { "options-case.ts": "export function handle() {}" },
        { options: [{ allowNames: ["handle"] }] },
      ).get("options-case.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "mysteriousName",
        { "options-case.ts": "const refresh = () => 1; export const run = refresh;" },
        { options: [{ verbs: [], checkAliases: false }] },
      ).get("options-case.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "mysteriousName",
        { "options-case.ts": "export function load() {}" },
        { options: [{ verbs: ["load"] }] },
      ).get("options-case.ts") ?? [],
    ).not.toEqual([]);
  });
  test("repeatedSwitches", () => {
    const results = lintCases("repeatedSwitches", {
      valid: [
        "function label(e) { switch (e._tag) { case 'A': return 1; case 'B': return 3; default: return 2; } }",
        "switch (a.kind) { case 'x': case 'y': } switch (b.kind) { case 'x': case 'y': }",
        "switch (part.type) { case 'text': case 'image': } switch (part.type) { case 'text': case 'tool_use': }",
        "if (event.type === 'click') a(); function f() { if (event.type === 'key') b(); }",
        "switch (true) { case a: case b: break; } switch (true) { case a: case b: break; }",
        "if (k === 'a') a(); log(); if (k === 'b') b(); if (k === 'a') a(); log(); if (k === 'b') b();",
        "if (a.id === b.id) x(); else if (a.id === c.id) y(); if (a.id === b.id) z(); else if (a.id === c.id) w();",
      ],
      invalid: [
        "\n\t\t\t\tfunction area(shape) { switch (shape.kind) { case 'circle': return 1; case 'square': return 2; } }\n\t\t\t\tfunction name(shape) { switch (shape.kind) { case 'circle': return 'c'; case 'square': return 's'; } }\n\t\t\t",
        "\n\t\t\t\tfunction a(e) { if (e._tag === 'Ready') return 1; else if (e._tag === 'Done') return 2; }\n\t\t\t\tfunction b(e) { return e._tag === 'Ready' ? 'r' : e._tag === 'Done' ? 'd' : 'x'; }\n\t\t\t",
        "\n\t\t\t\tfunction a(kind) {\n\t\t\t\t\tif (kind === Kind.A) return 1;\n\t\t\t\t\tif (kind === Kind.B || kind === Kind.C) return 2;\n\t\t\t\t\treturn 3;\n\t\t\t\t}\n\t\t\t\tfunction b(kind) { switch (kind) { case Kind.A: return 'a'; case Kind.C: return 'c'; } }\n\t\t\t",
        "switch (typeof value) { case 'string': case 'number': } const t = typeof value === 'string' ? 1 : typeof value === 'number' ? 2 : 3;",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("repeatedSwitches by file name", () => {
    expect(
      lintFixtures(
        "repeatedSwitches",
        {
          "options-case.ts":
            "switch (e._tag) { case 'A': case 'B': } switch (e._tag) { case 'A': case 'B': }",
        },
        { options: [{ minOccurrences: 3 }] },
      ).get("options-case.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures("repeatedSwitches", {
        "src/e.test.ts":
          "switch (e._tag) { case 'A': case 'B': } switch (e._tag) { case 'A': case 'B': }",
      }).get("src/e.test.ts") ?? [],
    ).toEqual([]);
    expect(
      lintFixtures(
        "repeatedSwitches",
        {
          "options-case.ts":
            "switch (part.type) { case 'text': case 'image': } switch (part.type) { case 'text': case 'tool_use': }",
        },
        { options: [{ minSharedCases: 1 }] },
      ).get("options-case.ts") ?? [],
    ).not.toEqual([]);
    expect(
      lintFixtures(
        "repeatedSwitches",
        {
          "src/e.test.ts":
            "switch (e._tag) { case 'A': case 'B': } switch (e._tag) { case 'A': case 'B': }",
        },
        { options: [{ ignoreTests: false }] },
      ).get("src/e.test.ts") ?? [],
    ).not.toEqual([]);
  });

  // Own cases: upstream has decode-after-status only as a model question (src/jev/effect-rules.ts).
  test("decodeAfterStatus", () => {
    const imports = `import { Effect, Schema } from "effect";\nimport { HttpClient, HttpClientResponse } from "effect/unstable/http";\n`;
    const results = lintCases("decodeAfterStatus", {
      valid: [
        // The response is filtered first.
        `${imports}export const get = (client: HttpClient.HttpClient) => client.get("/user").pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.flatMap(HttpClientResponse.schemaBodyJson(User)));`,
        // The client is filtered, here or where it is built.
        `${imports}export const make = Effect.gen(function* () { const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk); return { get: () => client.get("/user").pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(User))) }; });`,
        // The status is classified, and the success branch decodes.
        `${imports}export const get = (client: HttpClient.HttpClient) => client.get("/user").pipe(Effect.flatMap(HttpClientResponse.matchStatus({ "2xx": HttpClientResponse.schemaBodyJson(User), orElse: (response) => Effect.fail(new Failed({ status: response.status })) })));`,
        // The status is read before the decode.
        `${imports}export const get = Effect.fn("get")(function* (client: HttpClient.HttpClient) { const response = yield* client.get("/user"); if (response.status !== 200) return yield* Effect.fail(new Failed({ status: response.status })); return yield* HttpClientResponse.schemaBodyJson(User)(response); });`,
        // fetch, with res.ok checked first.
        `export async function load(url: string) { const res = await fetch(url); if (!res.ok) throw new Error("not ok"); return res.json(); }`,
        // A json field of something that is not a response.
        `export const read = (config: { json: string }) => JSON.parse(config.json);`,
      ],
      invalid: [
        `${imports}export const get = (client: HttpClient.HttpClient) => client.get("/user").pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(User)));`,
        `${imports}export const get = Effect.fn("get")(function* (client: HttpClient.HttpClient) { const response = yield* client.get("/user"); const user = yield* HttpClientResponse.schemaBodyJson(User)(response); if (response.status !== 200) return yield* Effect.fail(new Failed({})); return user; });`,
        `export async function load(url: string) { const res = await fetch(url); return res.json(); }`,
        // A status check in another function does not cover this one.
        `${imports}export const ok = (response: HttpClientResponse.HttpClientResponse) => response.status === 200;\nexport const get = (client: HttpClient.HttpClient) => client.get("/user").pipe(Effect.flatMap(HttpClientResponse.schemaJson(User)));`,
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });

  // Upstream names its own rules `anti-slop/…`; here they are this plugin's. Upstream's three
  // blanket-disable cases are require-suppression-reason's `missingTarget` here.
  test("noDisabledTypeAssertionRules", () => {
    const results = lintCases("noDisabledTypeAssertionRules", {
      valid: [
        "// SAFETY: The parser checked it.\nconst id = value as UserId;",
        "// oxlint-disable-next-line effecttsgo/return-effect-in-gen -- the inner Effect is the result\nconst x = 1;",
        "const x = 1; // eslint-disable-line no-console",
        "/* oxlint-disable no-console */\nconst x = 1;",
        "// This mentions oxlint-disable-next-line typescript/no-unsafe-type-assertion in prose.\nconst x = 1;",
        "// oxlint-disable-next-line local/no-type-assertion\nconst id = value as UserId;",
      ],
      invalid: [
        "// oxlint-disable-next-line typescript/consistent-type-assertions\nconst id = value as UserId;",
        "// oxlint-disable-next-line typescript/consistent-type-assertions, effect/noWidenThenAssert -- reason\nconst id = value as UserId;",
        "const id = value as UserId; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion",
        "/* oxlint-disable effect/no-chained-type-assertions */\nconst id = value as unknown as UserId;",
      ],
    });
    expect(results.reportedValid).toEqual([]);
    expect(results.missedInvalid).toEqual([]);
  });
  test("noDisabledTypeAssertionRules names each disabled rule and reads additionalRules", () => {
    const two = lintFixtures("noDisabledTypeAssertionRules", {
      "two.ts":
        "// oxlint-disable-next-line typescript/consistent-type-assertions, effect/noWidenThenAssert -- reason\nconst id = value as UserId;",
    }).get("two.ts");
    expect(two?.map((finding) => finding.message.split("`")[1])).toEqual([
      "typescript/consistent-type-assertions",
      "effect/noWidenThenAssert",
    ]);
    const local = lintFixtures(
      "noDisabledTypeAssertionRules",
      {
        "local.ts":
          "// oxlint-disable-next-line local/no-type-assertion\nconst id = value as UserId;",
      },
      { options: [{ additionalRules: ["local/no-type-assertion"] }] },
    ).get("local.ts");
    expect(local?.length).toBe(1);
  });
});
