import { describe, expect, test } from "bun:test";

import { noEffectAllStepSequencing, noManualDataGuard } from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

describe("noManualDataGuard", () => {
  test("reports a predicate that promotes unknown data", () => {
    const fn = {
      type: "FunctionDeclaration",
      params: [
        {
          type: "BindingIdentifier",
          name: "value",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: { type: "TSUnknownKeyword" },
          },
        },
      ],
      body: { type: "FunctionBody", statements: [] },
    };
    const predicate = {
      type: "TSTypePredicate",
      parameterName: { type: "Identifier", name: "value" },
      parent: fn,
    } as never;

    const result = Testing.runRule(noManualDataGuard, "TSTypePredicate", predicate);
    expect(result.length).toBe(1);
  });

  test("allows nominal instanceof guards", () => {
    const fn = {
      type: "FunctionDeclaration",
      params: [
        {
          type: "BindingIdentifier",
          name: "value",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: { type: "TSUnknownKeyword" },
          },
        },
      ],
      body: {
        type: "FunctionBody",
        statements: [{ type: "BinaryExpression", operator: "instanceof" }],
      },
    };
    const predicate = {
      type: "TSTypePredicate",
      parameterName: { type: "Identifier", name: "value" },
      parent: fn,
    } as never;

    const result = Testing.runRule(noManualDataGuard, "TSTypePredicate", predicate);
    Testing.expectNoDiagnostics(result);
  });
});

describe("noEffectAllStepSequencing", () => {
  test("reports stateful Effect.all steps forced to concurrency one", () => {
    const result = Testing.runRule(noEffectAllStepSequencing, "CallExpression", {
      type: "CallExpression",
      callee: Testing.memberExpr("Effect", "all"),
      arguments: [
        {
          type: "ArrayExpression",
          elements: [Testing.callOfMember("Ref", "set", [])],
        },
        {
          type: "ObjectExpression",
          properties: [
            {
              type: "Property",
              key: { type: "Identifier", name: "concurrency" },
              value: { type: "Literal", value: 1 },
            },
          ],
        },
      ],
    } as never);
    expect(result.length).toBe(1);
  });

  test("allows independent value aggregation", () => {
    const result = Testing.runRule(noEffectAllStepSequencing, "CallExpression", {
      type: "CallExpression",
      callee: Testing.memberExpr("Effect", "all"),
      arguments: [
        {
          type: "ArrayExpression",
          elements: [Testing.callOfMember("Effect", "succeed", [])],
        },
        {
          type: "ObjectExpression",
          properties: [
            {
              type: "Property",
              key: { type: "Identifier", name: "concurrency" },
              value: { type: "Literal", value: 1 },
            },
          ],
        },
      ],
    } as never);
    Testing.expectNoDiagnostics(result);
  });
});
