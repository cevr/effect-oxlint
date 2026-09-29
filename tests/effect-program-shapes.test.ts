import { describe, expect, test } from "bun:test";

import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

const effectImports = [
  'import * as Effect from "effect/Effect";',
  'import * as Cache from "effect/Cache";',
  'import * as Layer from "effect/Layer";',
  'import * as Schedule from "effect/Schedule";',
  'import * as Stream from "effect/Stream";',
].join("\n");

const withImports = (source: string): string => `${effectImports}\n${source}\n`;

describe("Effect program context", () => {
  test("treats generator bodies as owners and fn bodies as per-call operations", () => {
    const results = lintCases("noPerCallCacheConstruction", {
      valid: [
        withImports(
          "export const layer = Effect.gen(function* () { return yield* Effect.cached(load); });",
        ),
      ],
      invalid: [
        withImports(
          "export const run = Effect.fnUntraced(function* () { return yield* Effect.cached(load); });",
        ),
        withImports(
          'export const run = Effect.fn("Run")(function* () { return yield* Effect.cached(load); });',
        ),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("Effect.fn names", () => {
  test("reads the program from the first argument", () => {
    const results = lintCases("requireNamedEffectFn", {
      valid: [withImports('export const run = Effect.fn("Run")(function* () { return 1; });')],
      invalid: [
        withImports("export const run = Effect.fn(function* () { return 1; }, Effect.orDie);"),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("options objects", () => {
  test("read string-literal keys as static properties", () => {
    const results = lintCases("noUnboundedConcurrency", {
      valid: [withImports('Effect.forEach(items, run, { "concurrency": 4 });')],
      invalid: [withImports('Effect.forEach(items, run, { "concurrency": "unbounded" });')],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("report the unbounded concurrency value, not its property", () => {
    const findings = lintFixtures("noUnboundedConcurrency", {
      "run.ts": withImports('Effect.forEach(items, run, {\n  concurrency:\n    "unbounded",\n});'),
    });
    expect(reportedLines(findings, "run.ts")).toEqual([8]);
  });
});

describe("silent catch handlers", () => {
  test("require a single return of Effect.void", () => {
    const results = lintCases("noSilentCatchAll", {
      valid: [
        withImports("Effect.catchAll(effect, () => { return Effect.void; log(); });"),
        withImports("Effect.catchAll(effect, () => { Effect.void; });"),
      ],
      invalid: [withImports("Effect.catchAll(effect, () => { return Effect.void; });")],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("retry schedules", () => {
  test("follow piped schedules and their bounds", () => {
    const results = lintCases("noUnboundedRetry", {
      valid: [
        withImports(
          'Effect.retry(effect, Schedule.exponential("1 second").pipe(Schedule.both(Schedule.recurs(3))));',
        ),
      ],
      invalid: [
        withImports(
          'Effect.retry(effect, Schedule.exponential("1 second").pipe(Schedule.jittered));',
        ),
        withImports(
          "effect.pipe(Effect.retryOrElse(Schedule.forever, (error) => Effect.fail(error)));",
        ),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("Layer implementations", () => {
  test("find objects returned from Layer.sync and Effect.gen implementations", () => {
    const results = lintCases("preferServiceOf", {
      valid: [withImports("Layer.sync(Service, () => Service.of({ run }));")],
      invalid: [
        withImports("Layer.sync(Service, () => ({ run }));"),
        withImports("Layer.sync(Service, () => { return { run }; });"),
        withImports("Layer.effect(Service, Effect.gen(function* () { return { run }; }));"),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("collected streams", () => {
  test("require a collect operation and no terminating operation", () => {
    const results = lintCases("noRunCollectOnUnboundedStream", {
      valid: [
        withImports("Stream.fromQueue(queue).pipe(Stream.runDrain);"),
        withImports("Stream.runCollect(Stream.fromQueue(queue).pipe(Stream.take(10)));"),
      ],
      invalid: [withImports("Stream.runCollect(Stream.fromQueue(queue).pipe(Stream.map(read)));")],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("acquired handles", () => {
  const acquire = (thunk: string): string =>
    withImports(
      [
        "declare class Pool { close(): void }",
        "const pool = new Pool();",
        `export const resource = Effect.acquireRelease(Effect.sync(${thunk}), (handle) => Effect.sync(() => handle.close()));`,
      ].join("\n"),
    );

  test("trace captured handles through thunk shapes and parameter defaults", () => {
    const results = lintCases("noEagerAcquire", {
      valid: [
        acquire("() => { return pool; return new Pool(); }"),
        acquire("function handle() { return handle; }"),
        acquire("() => { const first = second; const second = first; return first; }"),
      ],
      invalid: [
        acquire("function () { return pool; }"),
        acquire("(handle = pool) => handle"),
        acquire("() => globalThis"),
        acquire("() => Math"),
        acquire("(other = new Pool(), handle = pool) => handle"),
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});
