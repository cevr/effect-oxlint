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
});
