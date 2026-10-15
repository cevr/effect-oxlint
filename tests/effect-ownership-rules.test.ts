import { describe, expect, test } from "bun:test";

import { noInlineProvide } from "../src/rules/no-inline-provide.js";
import { noNestedEffectGen } from "../src/rules/no-nested-effect-gen.js";
import { noPerCallCacheConstruction } from "../src/rules/no-per-call-cache-construction.js";
import { noRunCollectOnUnboundedStream } from "../src/rules/no-run-collect-on-unbounded-stream.js";
import { noSequentialEffectAll } from "../src/rules/no-sequential-effect-all.js";
import { noSilentCatchAll } from "../src/rules/no-silent-catch-all.js";
import { noUnboundedRetry } from "../src/rules/no-unbounded-retry.js";
import { requireNamedEffectFn } from "../src/rules/require-named-effect-fn.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases, lintFixtures } from "./support/lint-fixtures.js";

const insideEffectFn = (expression: ReturnType<typeof Testing.callOfMember>) => {
  const statement = Testing.exprStmt(expression);
  const body = Testing.blockStmt([statement]);
  const operation = Testing.arrowFn(body);
  const named = Testing.callOfMember("Effect", "fn", [Testing.strLiteral("Fixture.operation")]);
  const wrapper = { type: "CallExpression", callee: named, arguments: [operation] };
  Object.defineProperty(expression, "parent", { value: statement });
  Object.defineProperty(statement, "parent", { value: body });
  Object.defineProperty(body, "parent", { value: operation });
  Object.defineProperty(operation, "parent", { value: wrapper });
  return expression;
};

describe("named operations", () => {
  test("requires a stable name for Effect.fn", () => {
    const unnamed = Testing.callOfMember("Effect", "fn", [Testing.arrowFn()]);
    const named = Testing.callOfMember("Effect", "fn", [Testing.strLiteral("Users.find")]);
    const untraced = Testing.callOfMember("Effect", "fnUntraced", [Testing.arrowFn()]);
    expect(Testing.runRule(requireNamedEffectFn, "CallExpression", unnamed)).toHaveLength(1);
    expect(Testing.runRule(requireNamedEffectFn, "CallExpression", named)).toHaveLength(0);
    expect(Testing.runRule(requireNamedEffectFn, "CallExpression", untraced)).toHaveLength(0);
  });
});

describe("dependency ownership", () => {
  test("rejects provisioning inside an Effect operation", () => {
    const provide = insideEffectFn(
      Testing.callOfMember("Effect", "provide", [Testing.id("program"), Testing.id("layer")]),
    );
    expect(Testing.runRule(noInlineProvide, "CallExpression", provide)).toHaveLength(1);
  });

  test("allows provisioning at a composition boundary", () => {
    const provide = Testing.callOfMember("Effect", "provide", [
      Testing.id("program"),
      Testing.id("layer"),
    ]);
    expect(Testing.runRule(noInlineProvide, "CallExpression", provide)).toHaveLength(0);
  });
});

describe("flat sequencing", () => {
  test("rejects a directly yielded nested generator", () => {
    const nested = Testing.callOfMember("Effect", "gen", [Testing.arrowFn()]);
    const yielded = { type: "YieldExpression", argument: nested, delegate: true };
    const body = Testing.blockStmt([Testing.exprStmt(yielded)]);
    const generator = {
      type: "FunctionExpression",
      params: [],
      body,
      generator: true,
      async: false,
    };
    const outer = Testing.callOfMember("Effect", "gen", [generator]);
    Object.defineProperty(nested, "parent", { value: yielded });
    Object.defineProperty(yielded, "parent", { value: body.body[0] });
    Object.defineProperty(body.body[0], "parent", { value: body });
    Object.defineProperty(body, "parent", { value: generator });
    Object.defineProperty(generator, "parent", { value: outer });
    expect(Testing.runRule(noNestedEffectGen, "CallExpression", nested)).toHaveLength(1);
  });

  test("rejects serial Effect.all only when its result is discarded", () => {
    const steps = { type: "ArrayExpression", elements: [Testing.id("first")] };
    const discarded = Testing.callOfMember("Effect", "all", [
      steps,
      Testing.objectExpr([
        { key: "concurrency", value: Testing.numLiteral(1) },
        { key: "discard", value: Testing.boolLiteral(true) },
      ]),
    ]);
    const aggregated = Testing.callOfMember("Effect", "all", [
      steps,
      Testing.objectExpr([{ key: "concurrency", value: Testing.numLiteral(1) }]),
    ]);
    expect(Testing.runRule(noSequentialEffectAll, "CallExpression", discarded)).toHaveLength(1);
    expect(Testing.runRule(noSequentialEffectAll, "CallExpression", aggregated)).toHaveLength(0);
  });
});

describe("failure visibility", () => {
  test("rejects catchAll handlers that silently return Effect.void", () => {
    const silent = Testing.callOfMember("Effect", "catchAll", [
      Testing.arrowFn(Testing.memberExpr("Effect", "void")),
    ]);
    const observed = Testing.callOfMember("Effect", "catchAll", [
      Testing.arrowFn(Testing.callOfMember("Effect", "logError", [Testing.id("error")]), [
        Testing.id("error"),
      ]),
    ]);
    expect(Testing.runRule(noSilentCatchAll, "CallExpression", silent)).toHaveLength(1);
    expect(Testing.runRule(noSilentCatchAll, "CallExpression", observed)).toHaveLength(0);
  });
});

describe("log messages", () => {
  test("reports positional arguments after an Effect.log* message", () => {
    const results = lintCases("noPositionalLogArguments", {
      valid: [
        'Effect.logWarning("request failed").pipe(Effect.annotateLogs({ error: String(error) }));',
        "Effect.logError(cause);",
        'logger.logWarning("request failed", error);',
        'Console.log("a", "b");',
        'const Effect = { log: (...parts) => parts }; Effect.log("a", "b");',
      ],
      invalid: [
        'Effect.logWarning("request failed", error);',
        'Effect.logError("failed", cause);',
        'Effect.log("a", "b");',
        'import { Effect as E } from "effect"; E.logInfo("ready", port);',
        'import * as Fx from "effect/Effect"; Fx.logDebug("state", state);',
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });
});

describe("point-free loggers", () => {
  test("reports a variadic logger handed to a callback that is passed an index", () => {
    const results = lintCases("noPointFreeLog", {
      valid: [
        'import { Console, Effect } from "effect"; Effect.forEach(lines, (line) => Console.log(line));',
        "lines.forEach((line) => console.log(line));",
        'import { Console, Effect } from "effect"; Effect.flatMap(Effect.succeed("one"), Console.log);',
        'import { Console, Option } from "effect"; Option.map(Option.some("one"), Console.log);',
        'import { Console, Stream } from "effect"; Stream.map(lines, Console.log);',
        'import { Console } from "effect"; Console.log(lines);',
        "const logger = { log: (line) => line }; lines.forEach(logger.log);",
        "const own = (console) => lines.forEach(console.log);",
        'import { Effect } from "effect"; const own = (Console) => Effect.forEach(lines, Console.log);',
        'import { Effect } from "effect"; Effect.forEach(lines, Effect.succeed);',
      ],
      invalid: [
        'import { Console, Effect } from "effect"; Effect.forEach(lines, Console.log);',
        'import { Effect } from "effect"; Effect.forEach(lines, Effect.logInfo);',
        "lines.forEach(console.log);",
        'import { Console } from "effect"; lines.map(Console.error);',
        'import { Array as Arr, Console } from "effect"; Arr.map(lines, Console.log);',
        'import { Console as C, Effect } from "effect"; Effect.forEach(lines, C.log);',
        'import * as E from "effect/Effect"; E.forEach(lines, E.logInfo);',
        'import * as Console from "effect/Console"; lines.flatMap(Console.warn);',
        'import { Console, Effect } from "effect"; Effect.filter(lines, Console.log);',
        'import { Console, Effect } from "effect"; Effect.partition(lines, Console.log);',
        "lines.reduce(console.log);",
        'lines.some(console["error"]);',
        "Effect.forEach(lines, Console.log);",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("names the logger and the call that replaces it", () => {
    const findings = lintFixtures("noPointFreeLog", {
      "print.ts": 'import { Console, Effect } from "effect";\nEffect.forEach(lines, Console.log);',
    });
    expect(findings.get("print.ts")).toEqual([
      {
        line: 2,
        message:
          "Console.log passed point-free: it is variadic, and this call passes the index too, which it prints after each line. Write (line) => Console.log(line).",
      },
    ]);
  });
});

describe("cache ownership", () => {
  test("rejects cache construction on every Effect.fn call", () => {
    const cache = insideEffectFn(Testing.callOfMember("Cache", "make", [Testing.objectExpr([])]));
    expect(Testing.runRule(noPerCallCacheConstruction, "CallExpression", cache)).toHaveLength(1);
  });

  test("allows cache construction in an owning layer program", () => {
    const cache = Testing.callOfMember("Cache", "make", [Testing.objectExpr([])]);
    expect(Testing.runRule(noPerCallCacheConstruction, "CallExpression", cache)).toHaveLength(0);
  });
});

describe("bounded streams", () => {
  test("rejects runCollect on a clear unbounded source", () => {
    const source = Testing.callOfMember("Stream", "fromQueue", [Testing.id("queue")]);
    const collect = Testing.callOfMember("Stream", "runCollect", [source]);
    expect(Testing.runRule(noRunCollectOnUnboundedStream, "CallExpression", collect)).toHaveLength(
      1,
    );
  });

  test("allows a clear terminating operation before runCollect", () => {
    const source = Testing.callOfMember("Stream", "fromQueue", [Testing.id("queue")]);
    const pipe = {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: source,
        property: Testing.id("pipe"),
        computed: false,
      },
      arguments: [
        Testing.callOfMember("Stream", "take", [Testing.numLiteral(10)]),
        Testing.memberExpr("Stream", "runCollect"),
      ],
    };
    expect(Testing.runRule(noRunCollectOnUnboundedStream, "CallExpression", pipe)).toHaveLength(0);
  });
});

describe("retry ownership", () => {
  test("rejects explicit unbounded Stream and HttpClient retry schedules", () => {
    const schedule = Testing.callOfMember("Schedule", "exponential", [
      Testing.strLiteral("100 millis"),
    ]);
    const streamRetry = Testing.callOfMember("Stream", "retry", [schedule]);
    const httpRetry = Testing.callOfMember("HttpClient", "retryTransient", [
      Testing.objectExpr([{ key: "schedule", value: schedule }]),
    ]);
    expect(Testing.runRule(noUnboundedRetry, "CallExpression", streamRetry)).toHaveLength(1);
    expect(Testing.runRule(noUnboundedRetry, "CallExpression", httpRetry)).toHaveLength(1);
  });
});
