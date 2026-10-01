import { describe, expect, test } from "bun:test";

import { noManagedRuntimeInEffect } from "../src/rules/no-managed-runtime-in-effect.js";
import { noUnboundedConcurrency } from "../src/rules/no-unbounded-concurrency.js";
import { noUnboundedRetry } from "../src/rules/no-unbounded-retry.js";
import { preferServiceOf } from "../src/rules/prefer-service-of.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases, lintFixtures, reportedLines } from "./support/lint-fixtures.js";

describe("service implementation checks", () => {
  test("requires Service.of for an inline Layer implementation", () => {
    const implementation = Testing.objectExpr([{ key: "run", value: Testing.id("run") }]);
    const layer = Testing.callOfMember("Layer", "succeed", [Testing.id("Jobs"), implementation]);
    expect(Testing.runRule(preferServiceOf, "CallExpression", layer)).toHaveLength(1);
  });

  test("allows an implementation already built with Service.of", () => {
    const implementation = Testing.callOfMember("Jobs", "of", [Testing.objectExpr([])]);
    const layer = Testing.callOfMember("Layer", "succeed", [Testing.id("Jobs"), implementation]);
    expect(Testing.runRule(preferServiceOf, "CallExpression", layer)).toHaveLength(0);
  });

  test("reports an alternative layer static that aliases the live layer", () => {
    const results = lintCases("noAliasTestLayer", {
      valid: [
        "class Jobs { static Live = Layer.succeed(Jobs, live); static Test = Layer.succeed(Jobs, fake); }",
        "class Jobs { static Test = Jobs.fromEntries([]); }",
        "class Jobs { static Live = Jobs.layer; }",
        "class Jobs { Test = Jobs.Live; }",
        "class Jobs { static Test = (entries) => Jobs.make(entries); }",
        "class Jobs { static TestLive = Jobs.Live; }",
      ],
      invalid: [
        "class Jobs { static Live = build(); static Test = Jobs.Live; }",
        "class Jobs { static readonly Fake: Layer.Layer<Jobs> = Jobs.Live; }",
        "class Jobs { static Stub = () => Jobs.Live; }",
        "class Jobs { static Mock = this.Live; }",
        "class Jobs { static layer = build(); static layerTest = Jobs.layer; }",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("bounded concurrency", () => {
  const options = Testing.objectExpr([
    { key: "concurrency", value: Testing.strLiteral("unbounded") },
  ]);

  test("rejects unbounded concurrency for a dynamic collection", () => {
    const call = Testing.callOfMember("Effect", "forEach", [
      Testing.id("items"),
      Testing.arrowFn(Testing.callOfMember("Effect", "succeed")),
      options,
    ]);
    expect(Testing.runRule(noUnboundedConcurrency, "CallExpression", call)).toHaveLength(1);
  });

  test("allows an explicit fixed collection", () => {
    const call = Testing.callOfMember("Effect", "all", [
      { type: "ArrayExpression", elements: [Testing.id("first"), Testing.id("second")] },
      options,
    ]);
    expect(Testing.runRule(noUnboundedConcurrency, "CallExpression", call)).toHaveLength(0);
  });
});

describe("bounded retry", () => {
  test("rejects a direct unbounded backoff schedule", () => {
    const retry = Testing.callOfMember("Effect", "retry", [
      Testing.id("request"),
      Testing.callOfMember("Schedule", "exponential", [Testing.strLiteral("100 millis")]),
    ]);
    expect(Testing.runRule(noUnboundedRetry, "CallExpression", retry)).toHaveLength(1);
  });

  test("allows a backoff schedule with an explicit take bound", () => {
    const base = Testing.callOfMember("Schedule", "exponential", [
      Testing.strLiteral("100 millis"),
    ]);
    const schedule = {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: base,
        property: Testing.id("pipe"),
        computed: false,
      },
      arguments: [Testing.callOfMember("Schedule", "take", [Testing.numLiteral(3)])],
    };
    const retry = Testing.callOfMember("Effect", "retry", [Testing.id("request"), schedule]);
    expect(Testing.runRule(noUnboundedRetry, "CallExpression", retry)).toHaveLength(0);
  });
});

describe("retry schedules held in named values", () => {
  const header = 'import { Effect, Schedule } from "effect";\n';

  test("checks a const schedule, a const pipe base, and a const policy like inline values", () => {
    const results = lintCases("noUnboundedRetry", {
      valid: [
        `${header}const policy = Schedule.spaced("1 second").pipe(Schedule.take(3));\nEffect.retry(request, policy);`,
        `${header}const bound = Schedule.recurs(3);\nEffect.retry(request, Schedule.both(Schedule.spaced("1 second"), bound));`,
        `${header}const base = Schedule.spaced("1 second");\nconst bound = Schedule.take(3);\nEffect.retry(request, base.pipe(bound));`,
        `${header}const options = { schedule: Schedule.spaced("1 second"), times: 3 };\nEffect.retry(request, options);`,
        `${header}const retryWith = (schedule: Schedule.Schedule<number>) => Effect.retry(request, schedule);`,
        `${header}let policy = Schedule.spaced("1 second");\npolicy = policy.pipe(Schedule.take(3));\nEffect.retry(request, policy);`,
      ],
      invalid: [
        `${header}const policy = Schedule.spaced("1 second");\nEffect.retry(request, policy);`,
        `${header}const base = Schedule.exponential("10 millis");\nconst policy = base.pipe(Schedule.jittered);\nEffect.retry(request, policy);`,
        `${header}const options = { schedule: Schedule.spaced("1 second") };\nrequest.pipe(Effect.retry(options));`,
        `${header}const policy = Schedule.forever;\nconst alias = policy;\nEffect.retry(request, alias);`,
        `${header}const options = { schedule: Schedule.spaced("1 second") } satisfies Effect.Retry.Options<unknown>;\nEffect.retry(request, options);`,
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("checks HttpClient retries under an aliased effect/http/HttpClient import", () => {
    const http = 'import * as Http from "effect/http/HttpClient";\n';
    const results = lintCases("noUnboundedRetry", {
      valid: [
        `${header}${http}Http.retryTransient({ schedule: Schedule.spaced("1 second"), times: 3 });`,
      ],
      invalid: [`${header}${http}Http.retryTransient({ schedule: Schedule.spaced("1 second") });`],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("reports the retry call so a suppression above the call applies", () => {
    const source = [
      header.trimEnd(),
      "request.pipe(",
      "  Effect.retry({",
      '    schedule: Schedule.spaced("1 second"),',
      "  }),",
      ");",
      "request.pipe(",
      "  // oxlint-disable-next-line effect/noUnboundedRetry -- the caller interrupts this retry",
      "  Effect.retry({",
      '    schedule: Schedule.spaced("1 second"),',
      "  }),",
      ");",
    ].join("\n");
    const findings = lintFixtures("noUnboundedRetry", { "retry.ts": source });
    expect(reportedLines(findings, "retry.ts")).toEqual([3]);
  });
});

describe("ManagedRuntime ownership", () => {
  test("rejects ManagedRuntime.make inside Effect.gen", () => {
    const make = Testing.callOfMember("ManagedRuntime", "make", [Testing.id("layer")]);
    const body = Testing.blockStmt([Testing.exprStmt(make)]);
    const generator = {
      type: "FunctionExpression",
      params: [],
      body,
      generator: true,
      async: false,
    };
    const program = Testing.callOfMember("Effect", "gen", [generator]);
    Object.defineProperty(make, "parent", { value: body.body[0] });
    Object.defineProperty(body.body[0], "parent", { value: body });
    Object.defineProperty(body, "parent", { value: generator });
    Object.defineProperty(generator, "parent", { value: program });
    expect(Testing.runRule(noManagedRuntimeInEffect, "CallExpression", make)).toHaveLength(1);
  });

  test("allows ManagedRuntime.make at a host boundary", () => {
    const make = Testing.callOfMember("ManagedRuntime", "make", [Testing.id("layer")]);
    expect(Testing.runRule(noManagedRuntimeInEffect, "CallExpression", make)).toHaveLength(0);
  });
});

describe("Promise edges", () => {
  test("reports Effect.runPromise variants and runtime runPromise calls", () => {
    const results = lintCases("noRunPromise", {
      valid: [
        "Effect.runSync(program);",
        "Effect.runFork(program);",
        "runtime.runFork(program);",
        "client.runPromise(program);",
        "const runner = runtime.runPromise;",
        'const Effect = { runPromise: (x) => x }; Effect.runPromise("x");',
      ],
      invalid: [
        "Effect.runPromise(program);",
        "Effect.runPromiseExit(program);",
        "Effect.runPromiseWith(services)(program);",
        "program.pipe(Effect.runPromise);",
        'import { Effect as E } from "effect"; E.runPromise(program);',
        "runtime.runPromise(program);",
        "serverRuntime.runPromiseExit(program);",
        "ui.clientRuntime.runPromise(program);",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("leaves test modules to noEffectRunInTests and boundary files to an override", () => {
    const findings = lintFixtures("noRunPromise", {
      "main.ts": "Effect.runPromise(program);",
      "main.test.ts": "Effect.runPromise(program);",
    });
    expect(reportedLines(findings, "main.ts")).toEqual([1]);
    expect(reportedLines(findings, "main.test.ts")).toEqual([]);
  });
});

describe("child process termination", () => {
  const barrel = 'import { ChildProcess } from "effect/process";\n';
  const kill = '{ forceKillAfter: "5 seconds" }';

  test("requires forceKillAfter on every ChildProcess.make command", () => {
    const results = lintCases("requireForceKillAfter", {
      valid: [
        `${barrel}ChildProcess.make("git", ${kill});`,
        `${barrel}ChildProcess.make("git", ["status"], ${kill});`,
        `${barrel}ChildProcess.make({ cwd: "/app", forceKillAfter: "5 seconds" })\`ls -la\`;`,
        `${barrel}const options = ${kill}; ChildProcess.make("git", ["status"], options);`,
        `${barrel}const base = ${kill}; ChildProcess.make("git", ["status"], { ...base, cwd: "/app" });`,
        `${barrel}ChildProcess.make("git", ["status"], { ...options, cwd: "/app" });`,
        `${barrel}const forceKillAfter = "5 seconds"; ChildProcess.make("git", { forceKillAfter });`,
        `${barrel}const run = (options) => ChildProcess.make("git", ["status"], options);`,
        `${barrel}const run = (args) => ChildProcess.make("git", args);`,
        `${barrel}ChildProcess.make("git", ...rest);`,
        `${barrel}ChildProcess.make("sleep", { ["forceKillAfter"]: "5 seconds" });`,
        `${barrel}ChildProcess.make("sleep", ["9"], { [\`forceKillAfter\`]: "5 seconds" });`,
        'import * as ChildProcess from "effect/process/ChildProcess";\nChildProcess.make("git", { forceKillAfter: 5000 });',
        'const ChildProcess = { make: (cmd) => cmd }; ChildProcess.make("git");',
        'import { make } from "./local";\nmake("git");',
        'import { ChildProcess } from "effect/process";\nconst run = (ChildProcess) => ChildProcess.make("git");',
      ],
      invalid: [
        `${barrel}ChildProcess.make("git");`,
        `${barrel}ChildProcess.make("git", ["status"]);`,
        `${barrel}ChildProcess.make("git", { cwd: "/app" });`,
        `${barrel}ChildProcess.make("sleep", { [key]: "5 seconds" });`,
        `${barrel}ChildProcess.make("sleep", { [\`force\${kill}\`]: "5 seconds" });`,
        `${barrel}ChildProcess.make("git", ["status"], { cwd: "/app" });`,
        `${barrel}ChildProcess.make({ cwd: "/app" })\`ls -la\`;`,
        `${barrel}ChildProcess.make\`ls -la\`;`,
        `${barrel}const options = { cwd: "/app" }; ChildProcess.make("git", ["status"], options);`,
        `${barrel}const base = { cwd: "/app" }; ChildProcess.make("git", ["status"], { ...base });`,
        `${barrel}ChildProcess.make("git", ["status"], { killSignal: "SIGKILL" });`,
        'import * as CP from "effect/process/ChildProcess";\nCP.make("git", ["status"]);',
        'import { make } from "effect/process/ChildProcess";\nmake("git");',
        'import { make as command } from "effect/process/ChildProcess";\ncommand`ls -la`;',
        'import * as P from "effect/process";\nP.ChildProcess.make("git");',
        'import { ChildProcess as CP } from "effect/process";\nCP.make("git", []);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the unbounded wait and the fix", () => {
    const findings = lintFixtures("requireForceKillAfter", {
      "spawn.ts": [
        'import { ChildProcess } from "effect/process";',
        'const status = ChildProcess.make("git", ["status"]);',
        "const list = ChildProcess.make`ls -la`;",
      ].join("\n"),
    });
    expect(findings.get("spawn.ts")).toEqual([
      { line: 2, message: expect.stringContaining("waits for exit with no bound") },
      { line: 3, message: expect.stringContaining("template form") },
    ]);
  });
});

describe("interruptible memos", () => {
  const effect = 'import { Effect, pipe } from "effect";\n';

  test("rejects a memo whose first caller's interruption every later caller gets back", () => {
    const results = lintCases("noInterruptibleMemo", {
      valid: [
        "const Effect = { cached: (x) => x }; const memo = Effect.cached(load);",
        `${effect}const fiber = Effect.forkDetach(load);`,
        'import { cached as memoize } from "effect/Effect"; function local(memoize) { return memoize(load); }',
        'import { cached as memoize } from "another-package"; const memo = memoize(load);',
        'import { cached as memoize } from "effect/Effect"; const fields = { memoize: 1 }; object.memoize(load);',
      ],
      invalid: [
        `${effect}const memo = Effect.cached(Effect.uninterruptible(load));`,
        `${effect}const memo = Effect.cached(load.pipe(Effect.retry(policy), Effect.uninterruptible));`,
        `${effect}const memo = load.pipe(Effect.uninterruptible, Effect.cached);`,
        `${effect}const memo = Effect.uninterruptible(load).pipe(Effect.cached);`,
        `${effect}const memo = pipe(load, Effect.uninterruptible, Effect.cachedWithTTL("5 minutes"));`,
        `${effect}const safe = Effect.uninterruptible(load);\nconst memo = Effect.cached(safe);`,
        `${effect}const memo = Effect.cachedWithTTL(load, (exit) => (Exit.hasInterrupts(exit) ? 0 : "5 minutes"));`,
        `${effect}const memo = load.pipe(Effect.cachedInvalidateWithTTL(function ttl(exit) { return 0; }));`,
        `${effect}const memo = Effect.cachedWithTTL(load, () => "1 hour");`,
        'import { cached as memoize } from "effect/Effect"; const memo = memoize(load);',
        'import { cachedWithTTL as memoize } from "effect/Effect"; const memo = load.pipe(memoize("1 hour"));',
        'import { cachedInvalidateWithTTL } from "effect/Effect"; const memo = cachedInvalidateWithTTL(load, "1 hour");',
        'import { cached as memoize } from "effect/Effect"; const operator = memoize; const memo = load.pipe(operator);',
        `${effect}const memo = Effect.cached(load);`,
        `${effect}const memo = Effect["cached"](load);`,
        `${effect}const scan = Effect.gen(function* () {\n  return yield* Effect.cached(finder.waitForScan);\n});`,
        `${effect}const memo = Effect.cachedWithTTL(loadCatalog(home), "5 minutes");`,
        `${effect}const pair = Effect.gen(function* () {\n  return yield* Effect.cachedInvalidateWithTTL(load, "1 hour");\n});`,
        `${effect}const memo = load.pipe(Effect.cached);`,
        `${effect}const memo = load.pipe(Effect.cachedWithTTL("5 minutes"));`,
        `${effect}const memo = pipe(load, Effect.cached);`,
        `${effect}const memo = load.pipe(Effect.uninterruptible, Effect.retry(policy), Effect.cached);`,
        `${effect}const memo = Effect.cached(Effect.uninterruptible(load).pipe(Effect.timeout("1 second")));`,
        `${effect}const memo = Effect.cached(Effect.uninterruptibleMask((restore) => restore(load)));`,
        'import * as E from "effect/Effect";\nconst memo = E.cached(load);',
        `${effect}const make = Effect.cached;`,
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the started fiber and Cache as the fix", () => {
    const findings = lintFixtures("noInterruptibleMemo", {
      "memo.ts": `${effect}const memo = Effect.cached(load);`,
    });
    expect(findings.get("memo.ts")).toEqual([
      { line: 2, message: expect.stringContaining("Memoize a started fiber") },
    ]);
  });
});
