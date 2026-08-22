import { describe, expect, test } from "bun:test";

import { noManagedRuntimeInEffect } from "../src/rules/no-managed-runtime-in-effect.js";
import { noUnboundedConcurrency } from "../src/rules/no-unbounded-concurrency.js";
import { noUnboundedRetry } from "../src/rules/no-unbounded-retry.js";
import { preferServiceOf } from "../src/rules/prefer-service-of.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

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
      { type: "ArrayExpression", elements: [Testing.id("first"), Testing.id("second")] } as never,
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
    } as never;
    const retry = Testing.callOfMember("Effect", "retry", [Testing.id("request"), schedule]);
    expect(Testing.runRule(noUnboundedRetry, "CallExpression", retry)).toHaveLength(0);
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
    } as never;
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
