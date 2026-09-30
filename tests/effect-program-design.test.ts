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
