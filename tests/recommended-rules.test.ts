import { describe, expect, test } from "bun:test";

import { recommended } from "../src/presets/recommended.js";
import {
  noAs,
  noAsyncFunction,
  noDynamicImports,
  noEffectBind,
  noEffectDo,
  noNewError,
  noNewPromise,
  noTernary,
  noTestLifecycleHooks,
  noThrowStatement,
  noTryCatch,
} from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

describe("recommended preset", () => {
  test("enables the complete maintained rule set at error severity", () => {
    expect(recommended).toEqual({
      "effect/noAs": "error",
      "effect/noAsyncFunction": "error",
      "effect/noDynamicImports": "error",
      "effect/noEffectBind": "error",
      "effect/noEffectDo": "error",
      "effect/noGlobals": "error",
      "effect/noNewError": "error",
      "effect/noNewPromise": "error",
      "effect/noNodeBuiltinImport": "error",
      "effect/noTernary": "error",
      "effect/noTestLifecycleHooks": "error",
      "effect/noThrowStatement": "error",
      "effect/noTryCatch": "error",
    });
  });
});

describe("unconditional syntax", () => {
  test("rejects as assertions and allows satisfies expressions", () => {
    expect(
      Testing.runRule(noAs, "TSAsExpression", Testing.tsAsExpr("TSTypeReference")),
    ).toHaveLength(1);

    const satisfiesExpression = {
      type: "TSSatisfiesExpression",
      expression: Testing.id("value"),
      typeAnnotation: Testing.tsTypeRef("Expected"),
    } as never;
    expect(Testing.runRule(noAs, "TSSatisfiesExpression", satisfiesExpression)).toHaveLength(0);
  });

  test("rejects test lifecycle hooks", () => {
    for (const hook of ["afterAll", "afterEach", "beforeAll", "beforeEach"]) {
      expect(
        Testing.runRule(noTestLifecycleHooks, "CallExpression", Testing.callExpr(hook)),
      ).toHaveLength(1);
    }

    expect(
      Testing.runRule(noTestLifecycleHooks, "CallExpression", Testing.callExpr("scoped")),
    ).toHaveLength(0);
  });

  test("rejects async functions and await", () => {
    const asyncFunction = { ...Testing.arrowFn(), async: true } as never;
    const awaitExpression = {
      type: "AwaitExpression",
      argument: Testing.callExpr("work"),
    } as never;
    expect(Testing.runRule(noAsyncFunction, "ArrowFunctionExpression", asyncFunction)).toHaveLength(
      1,
    );
    expect(Testing.runRule(noAsyncFunction, "AwaitExpression", awaitExpression)).toHaveLength(1);
  });

  test("rejects every try shape and every throw", () => {
    expect(Testing.runRule(noTryCatch, "TryStatement", Testing.tryStmt())).toHaveLength(1);
    expect(Testing.runRule(noThrowStatement, "ThrowStatement", Testing.throwStmt())).toHaveLength(
      1,
    );
  });

  test("rejects global Promise construction and static APIs", () => {
    expect(Testing.runRule(noNewPromise, "NewExpression", Testing.newExpr("Promise"))).toHaveLength(
      1,
    );
    expect(
      Testing.runRule(noNewPromise, "CallExpression", Testing.callOfMember("Promise", "all", [])),
    ).toHaveLength(1);
  });

  test("rejects ternaries but does not own ordinary if statements", () => {
    const ternary = {
      type: "ConditionalExpression",
      test: Testing.id("condition"),
      consequent: Testing.id("yes"),
      alternate: Testing.id("no"),
    } as never;
    expect(Testing.runRule(noTernary, "ConditionalExpression", ternary)).toHaveLength(1);
    expect(Testing.runRule(noTernary, "IfStatement", Testing.ifStmt())).toHaveLength(0);
  });
});

describe("Effect API policy", () => {
  test("rejects Effect.Do and Effect.bind", () => {
    expect(
      Testing.runRule(noEffectDo, "MemberExpression", Testing.memberExpr("Effect", "Do")),
    ).toHaveLength(1);
    expect(
      Testing.runRule(noEffectBind, "MemberExpression", Testing.memberExpr("Effect", "bind")),
    ).toHaveLength(1);
  });

  test("does not reject valid Effect APIs", () => {
    for (const [object, property] of [
      ["Effect", "as"],
      ["Option", "as"],
      ["Effect", "never"],
      ["Effect", "async"],
      ["Runtime", "runFork"],
    ] as const) {
      expect(
        Testing.runRule(noEffectDo, "MemberExpression", Testing.memberExpr(object, property)),
      ).toHaveLength(0);
      expect(
        Testing.runRule(noEffectBind, "MemberExpression", Testing.memberExpr(object, property)),
      ).toHaveLength(0);
    }
  });
});

describe("native errors", () => {
  test("rejects native errors used as expected failures", () => {
    expect(Testing.runRule(noNewError, "NewExpression", Testing.newExpr("Error"))).toHaveLength(1);
    expect(Testing.runRule(noNewError, "NewExpression", Testing.newExpr("TypeError"))).toHaveLength(
      1,
    );
    expect(
      Testing.runRule(noNewError, "NewExpression", Testing.newExpr("DomainError")),
    ).toHaveLength(0);
  });

  test("allows a native error passed directly to explicit defect constructors", () => {
    for (const namespace of ["Effect", "Cause", "Exit"]) {
      const error = Testing.newExpr("Error");
      const defect = Testing.callOfMember(namespace, "die", [error]);
      Object.defineProperty(error, "parent", { value: defect });
      expect(Testing.runRule(noNewError, "NewExpression", error)).toHaveLength(0);
    }
  });

  test("rejects an Error merely created inside a callback passed to die", () => {
    const error = Testing.newExpr("Error");
    const callback = Testing.arrowFn(error);
    const defect = Testing.callOfMember("Effect", "die", [callback]);
    Object.defineProperty(error, "parent", { value: callback });
    Object.defineProperty(callback, "parent", { value: defect });
    expect(Testing.runRule(noNewError, "NewExpression", error)).toHaveLength(1);
  });
});

describe("dynamic loading", () => {
  test("rejects inline imports and require", () => {
    const imported = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    } as never;
    expect(Testing.runRule(noDynamicImports, "ImportExpression", imported)).toHaveLength(1);
    expect(
      Testing.runRule(
        noDynamicImports,
        "CallExpression",
        Testing.callExpr("require", [Testing.strLiteral("./module.cjs")]),
      ),
    ).toHaveLength(1);
  });

  test("allows a dynamic import assigned to a descriptive binding", () => {
    const imported = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    } as never;
    const awaited = { type: "AwaitExpression", argument: imported } as never;
    const binding = {
      type: "VariableDeclarator",
      id: Testing.id("moduleNamespace"),
      init: awaited,
    } as never;
    Object.defineProperty(imported, "parent", { value: awaited });
    Object.defineProperty(awaited, "parent", { value: binding });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", imported)).toHaveLength(0);
  });

  test("allows direct Effect promise boundaries and named destructuring", () => {
    const importedByEffect = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    } as never;
    const callback = Testing.arrowFn(importedByEffect);
    const boundary = Testing.callOfMember("Effect", "tryPromise", [callback]);
    Object.defineProperty(importedByEffect, "parent", { value: callback });
    Object.defineProperty(callback, "parent", { value: boundary });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", importedByEffect)).toHaveLength(0);

    const importedByBinding = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    } as never;
    const destructuring = {
      type: "VariableDeclarator",
      id: {
        type: "ObjectPattern",
        properties: [
          {
            type: "Property",
            key: Testing.id("moduleValue"),
            value: Testing.id("moduleValue"),
            computed: false,
            shorthand: true,
            kind: "init",
            method: false,
          },
        ],
      },
      init: importedByBinding,
    } as never;
    Object.defineProperty(importedByBinding, "parent", { value: destructuring });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", importedByBinding)).toHaveLength(
      0,
    );
  });
});
