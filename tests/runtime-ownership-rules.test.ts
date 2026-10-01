import { describe, expect, test } from "bun:test";

import { lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("noModuleLevelMutableState", () => {
  const findings = lintFixtures("noModuleLevelMutableState", {
    "state.ts": [
      "let requests = 0;", // 1: module let
      "export let current = 0;", // 2: exported module let
      "var legacy = 1;", // 3: module var
      "if (legacy > 0) {",
      "  var hoisted = 2;", // 5: var in a module-level block is module scoped
      "  let blockLocal = 3;", // 6: block-scoped let is not module state
      "}",
      "for (let index = 0; index < 1; index++) {}", // 8: loop binding
      "export const count = () => {",
      "  let local = requests;", // 10: function-local let
      "  var alsoLocal = local;", // 11: function-local var
      "  return alsoLocal + current + hoisted;",
      "};",
      "class Counter {",
      "  static {",
      "    var inStaticBlock = 0;", // 16: static block var
      "  }",
      "}",
      "declare let ambient: number;", // 19: ambient declaration
      "export const limit = 10;",
      "",
    ].join("\n"),
    "state.test.ts": "let fixtureCounter = 0;\nexport const next = () => fixtureCounter;\n",
    "state.spec.ts": "var specCounter = 0;\nexport const next = () => specCounter;\n",
  });

  test("reports module-scoped let and var, including var hoisted out of blocks", () => {
    expect(reportedLines(findings, "state.ts")).toEqual([1, 2, 3, 5]);
    expect(findings.get("state.ts")?.[0]?.message).toContain("Ref");
  });

  test("ignores test and spec files", () => {
    expect(reportedLines(findings, "state.test.ts")).toEqual([]);
    expect(reportedLines(findings, "state.spec.ts")).toEqual([]);
  });
});

describe("noEagerAcquire", () => {
  const findings = lintFixtures("noEagerAcquire", {
    "resources.ts": [
      'import * as Effect from "effect/Effect";',
      'import { Effect as E } from "effect";',
      "declare class Pool { close(): void }",
      "const shared = new Pool();",
      "const release = (pool: Pool) => Effect.sync(() => pool.close());",
      "export const eager = Effect.acquireRelease(Effect.succeed(new Pool()), release);", // 6
      "export const captured = Effect.acquireRelease(Effect.sync(() => shared), release);", // 7
      "export const block = Effect.acquireRelease(", // 8
      "  Effect.sync(() => {",
      "    const handle = shared;",
      "    return handle;",
      "  }),",
      "  release,",
      ");",
      "export const aliased = E.acquireRelease(E.succeed(shared), release);", // 15
      "export const lazy = Effect.acquireRelease(Effect.sync(() => new Pool()), release);",
      "export const built = Effect.acquireRelease(",
      "  Effect.sync(() => {",
      "    const pool = new Pool();",
      "    return pool;",
      "  }),",
      "  release,",
      ");",
      "export const promised = Effect.acquireRelease(",
      "  Effect.tryPromise(() => Promise.resolve(new Pool())),",
      "  release,",
      ");",
      "",
    ].join("\n"),
    "shadowed.ts": [
      "const Effect = { acquireRelease: (a: number, b: number) => a + b, succeed: (a: number) => a };",
      "export const local = Effect.acquireRelease(Effect.succeed(1), 2);",
      "",
    ].join("\n"),
  });

  test("reports resources built before acquire runs, through Effect aliases", () => {
    expect(reportedLines(findings, "resources.ts")).toEqual([6, 7, 9, 15]);
    expect(findings.get("resources.ts")?.[0]?.message).toContain("leaks");
  });

  test("allows resources constructed inside the acquire Effect", () => {
    expect(reportedLines(findings, "resources.ts")).not.toContain(16);
    expect(reportedLines(findings, "resources.ts")).not.toContain(18);
    expect(reportedLines(findings, "resources.ts")).not.toContain(25);
  });

  test("ignores a local binding that shadows Effect", () => {
    expect(reportedLines(findings, "shadowed.ts")).toEqual([]);
  });
});

describe("noEffectRunInTests", () => {
  const program = [
    'import * as Effect from "effect/Effect";',
    'import { Effect as Fx, ManagedRuntime as Runtime } from "effect";',
    'import * as Layer from "effect/Layer";',
    "const program = Effect.succeed(1);",
    "export const promise = Effect.runPromise(program);", // 5
    "export const exit = Fx.runSyncExit(program);", // 6
    "export const piped = program.pipe(Effect.runPromiseExit);", // 7
    "export const runtime = Runtime.make(Layer.empty);", // 8
    "export const built = Effect.map(program, (value) => value + 1);",
    "",
  ].join("\n");
  const findings = lintFixtures("noEffectRunInTests", {
    "program.test.ts": program,
    "program.spec.tsx": program,
    "program.ts": program,
    "main.ts": 'import * as Effect from "effect/Effect";\nEffect.runFork(Effect.void);\n',
  });

  test("reports manual runners and ManagedRuntime.make in test files", () => {
    expect(reportedLines(findings, "program.test.ts")).toEqual([5, 6, 7, 8]);
    expect(reportedLines(findings, "program.spec.tsx")).toEqual([5, 6, 7, 8]);
    expect(findings.get("program.test.ts")?.[0]?.message).toContain("it.effect");
  });

  test("allows runners at application boundaries outside tests", () => {
    expect(reportedLines(findings, "program.ts")).toEqual([]);
    expect(reportedLines(findings, "main.ts")).toEqual([]);
  });

  const runtimeRunners = [
    'import { Effect, ManagedRuntime } from "effect";',
    "declare const runtime: ManagedRuntime.ManagedRuntime<never, never>;",
    'export const direct = runtime.runPromise(Effect.succeed("work"));', // 3
    'export const nested = ui.clientRuntime.runPromiseExit(Effect.succeed("work"));', // 4
    'export const anyReceiver = rt.runPromiseWith(Effect.succeed("work"));', // 5
    'export const piped = Effect.succeed("work").pipe(runtime.runPromise);', // 6
    'export const sync = runtime.runSync(Effect.succeed("work"));', // 7
    "export const named = { runPromise: 1 };",
    "export const read = settings.runPromiseTimeout;",
    "",
  ].join("\n");

  test("reports runners on a runtime value in test files, called or passed", () => {
    const runtimeFindings = lintFixtures(
      "noEffectRunInTests",
      {
        "harness.test.ts": runtimeRunners,
        "harness.ts": runtimeRunners,
        "server-boundary.test.ts": runtimeRunners,
      },
      {
        overrides: [
          { files: ["**/*-boundary.test.ts"], rules: { "effect/noEffectRunInTests": "off" } },
        ],
      },
    );
    expect(reportedLines(runtimeFindings, "harness.test.ts")).toEqual([3, 4, 5, 6, 7]);
    expect(runtimeFindings.get("harness.test.ts")?.[0]?.message).toBe(
      "Do not run Effects by hand in tests (runtime.runPromise). Use the test runner's Effect integration: it.effect(...) or it.layer(layer)(...) from @effect/vitest or effect-bun-test.",
    );
    expect(runtimeFindings.get("harness.test.ts")?.[1]?.message).toContain(
      "(clientRuntime.runPromiseExit)",
    );
    expect(reportedLines(runtimeFindings, "harness.ts")).toEqual([]);
    expect(reportedLines(runtimeFindings, "server-boundary.test.ts")).toEqual([]);
  });

  test("reports a runner read through a computed key that names it", () => {
    const computed = [
      'import { Effect, ManagedRuntime } from "effect";',
      "declare const runtime: ManagedRuntime.ManagedRuntime<never, never>;",
      'const runPromise = "runPromise";',
      'const method = "runSync" as const;',
      "export const viaConst = runtime[runPromise](Effect.void);", // 5
      'export const viaLiteral = runtime["runPromiseExit"](Effect.void);', // 6
      "export const viaAsConst = runtime[method](Effect.void);", // 7
      "export const viaTemplate = runtime[`runFork`](Effect.void);", // 8
      'let mutable = "runPromise";',
      "export const reassignable = runtime[mutable];",
      "export const unknownKey = runtime[otherKey];",
      'export const notARunner = settings["runPromiseTimeout"];',
      "export const indexed = runners[0];",
      "",
    ].join("\n");
    const computedFindings = lintFixtures("noEffectRunInTests", {
      "computed.test.ts": computed,
    });
    expect(reportedLines(computedFindings, "computed.test.ts")).toEqual([5, 6, 7, 8]);
    expect(computedFindings.get("computed.test.ts")?.[0]?.message).toContain(
      "(runtime.runPromise)",
    );
  });
});
