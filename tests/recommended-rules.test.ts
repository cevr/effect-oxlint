import { describe, expect, test } from "bun:test";

import recommendedJson from "../presets/recommended.json";
import { recommended } from "../src/presets/recommended.js";
import {
  noAs,
  noAsyncFunction,
  noDynamicImports,
  noEffectBind,
  noEffectDo,
  noModuleMocks,
  noNewError,
  noNullish,
  noPlatformLayerOutsideEntry,
  noPositionalLogArguments,
  noRunPromise,
  noTernary,
  noTestLifecycleHooks,
  noThrowStatement,
  noTimeoutDieInTests,
  noTryCatch,
  noWithWrapperCall,
} from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";
import { lintCases, lintFixtures } from "./support/lint-fixtures.js";
import { runCommand } from "./support/run-command.js";

/** Rules that encode a project policy the preset cannot assume; a project enables each by name. */
const optInRules = {
  noPlatformLayerOutsideEntry,
  noPositionalLogArguments,
  noRunPromise,
  noTimeoutDieInTests,
  noWithWrapperCall,
};

describe("recommended preset", () => {
  test("enables the complete maintained rule set at error severity", () => {
    expect(recommended).toEqual({
      complexity: ["error", { max: 21 }],
      "effect/maxCognitiveComplexity": ["error", { max: 21 }],
      "effect/maxHalsteadDifficulty": ["error", { max: 79 }],
      "effect/noAliasTestLayer": "error",
      "effect/noArrayFilterMap": "error",
      "effect/noAs": "error",
      "effect/noAsyncFunction": "error",
      "effect/noChainedTypeAssertions": "error",
      "effect/noConditionalEmptyObjectSpread": "error",
      "effect/noDynamicImports": "error",
      "effect/noEagerAcquire": "error",
      "effect/noEffectBind": "error",
      "effect/noEffectBunTestItCall": "error",
      "effect/noEffectDo": "error",
      "effect/noEffectRunInTests": "error",
      "effect/noFixedWaitInTests": "error",
      "effect/noGlobals": "error",
      "effect/noInlineProvide": "error",
      "effect/noKnownValueWidening": "error",
      "effect/noLintEvasion": "error",
      "effect/noLocaleCompare": "error",
      "effect/noManagedRuntimeInEffect": "error",
      "effect/noModuleLevelMutableState": "error",
      "effect/noModuleMocks": "error",
      "effect/noModulePathFacts": "error",
      "effect/noNestedEffectGen": "error",
      "effect/noNewError": "error",
      "effect/noNewPromise": "error",
      "effect/noNodeBuiltinImport": "error",
      "effect/noNullish": "error",
      "effect/noObjectParameters": "error",
      "effect/noPerCallCacheConstruction": "error",
      "effect/noPromiseChainsInTests": "error",
      "effect/noReduceAccumulatorCopy": "error",
      "effect/noReflectApply": "error",
      "effect/noReflectGet": "error",
      "effect/noRunCollectOnUnboundedStream": "error",
      "effect/noRuntimeTypeof": "error",
      "effect/noSequentialEffectAll": "error",
      "effect/noShapeInSymbolNames": "error",
      "effect/noSilentCatchAll": "error",
      "effect/preferEffectFn": "error",
      "effect/noTernary": "error",
      "effect/noTestGlobals": "error",
      "effect/noTestLifecycleHooks": "error",
      "effect/noThrowStatement": "error",
      "effect/noTryCatch": "error",
      "effect/noUnknownParameters": "error",
      "effect/noUnknownReturns": "error",
      "effect/noUnknownTypeAliases": "error",
      "effect/noUnsafeDictionaryType": "error",
      "effect/noUnboundedConcurrency": "error",
      "effect/noUnboundedRetry": "error",
      "effect/noWidenThenAssert": "error",
      "effect/preferCatchTag": "error",
      "effect/preferMatchTagsExhaustive": "error",
      "effect/preferPredicateIsTagged": "error",
      "effect/preferSchemaTaggedUnion": "error",
      "effect/preferServiceOf": "error",
      "effect/requireForceKillAfter": "error",
      "effect/requireNamedEffectFn": "error",
      "effect/requireSuppressionReason": "error",
    });
  });

  test("leaves opt-in rules out while the plugin still registers them", () => {
    for (const [name, rule] of Object.entries(optInRules)) {
      expect(recommended).not.toHaveProperty(`effect/${name}`);
      expect(rule.meta?.docs?.recommended).toBe(false);
    }
  });

  test("ships the same rules as a JSON preset that loads the plugin", () => {
    expect<unknown>(recommendedJson).toEqual({
      plugins: [],
      jsPlugins: ["oxlint-plugin-effect/plugin"],
      rules: recommended,
    });
  });

  test("applies the JSON preset to a config that extends it", () => {
    const result = runCommand([
      "bunx",
      "oxlint",
      "--format",
      "unix",
      "--config",
      "tests/integration/preset-oxlint.json",
      "tests/integration/invalid.ts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("effect(noAsyncFunction)");
    expect(result.stdout).toContain("eslint(complexity)");
  });

  test("leaves the extending config's plugin list in charge", () => {
    const result = runCommand([
      "bunx",
      "oxlint",
      "--format",
      "unix",
      "--config",
      "tests/integration/preset-consumer-oxlint.json",
      "tests/integration/preset-plugin-scope.ts",
    ]);
    expect(result.stdout).not.toContain("unicorn(");
    expect(result.exitCode).toBe(0);
  });
});

describe("unconditional syntax", () => {
  test("rejects explicit nullish values and types", () => {
    const results = lintCases("noNullish", {
      valid: ['const label = "available";', "const pattern = /[a&&b]/v;"],
      invalid: [
        "const missing = null;",
        "const missing = undefined;",
        "type Missing = null;",
        "type Missing = undefined;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
    expect(
      lintFixtures("noNullish", { "value.ts": "const missing = null;" }).get("value.ts"),
    ).toEqual([{ line: 1, message: expect.stringContaining("Use Option") }]);
  });

  test("allows a regex literal whose value the host could not construct", () => {
    // The host AST gives a regex it cannot compile in this runtime a null value.
    const uncompilableRegex = {
      type: "Literal",
      // oxlint-disable-next-line effect/noNullish -- mirrors the host AST: an uncompilable regex literal has value null
      value: null,
      regex: { flags: "v", pattern: "[a&&b]" },
    };
    expect(Testing.runRule(noNullish, "Literal", uncompilableRegex)).toHaveLength(0);
  });

  test("allows null only as the Object.create prototype", () => {
    const results = lintCases("noNullish", {
      valid: ["const dictionary = Object.create(null);"],
      invalid: ["const dictionary = Object.create(prototype, null);"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("rejects as assertions and allows satisfies expressions", () => {
    const asExpression = {
      type: "TSAsExpression",
      expression: Testing.id("value"),
      typeAnnotation: Testing.tsTypeRef("Expected"),
    };
    expect(Testing.runRule(noAs, "TSAsExpression", asExpression)).toHaveLength(1);
    expect(
      Testing.runRule(noAs, "TSAsExpression", Testing.tsAsExpr("TSUnknownKeyword")),
    ).toHaveLength(1);

    const satisfiesExpression = {
      type: "TSSatisfiesExpression",
      expression: Testing.id("value"),
      typeAnnotation: Testing.tsTypeRef("Expected"),
    };
    expect(Testing.runRule(noAs, "TSSatisfiesExpression", satisfiesExpression)).toHaveLength(0);
  });

  test("allows as const, which narrows a literal and asserts nothing", () => {
    const constAssertion = {
      type: "TSAsExpression",
      expression: Testing.id("value"),
      typeAnnotation: Testing.tsTypeRef("const"),
    };
    expect(Testing.runRule(noAs, "TSAsExpression", constAssertion)).toHaveLength(0);

    const namedAssertion = {
      type: "TSAsExpression",
      expression: Testing.id("value"),
      typeAnnotation: Testing.tsTypeRef("Constant"),
    };
    expect(Testing.runRule(noAs, "TSAsExpression", namedAssertion)).toHaveLength(1);
  });

  test("rejects angle-bracket assertions with the as exemptions", () => {
    const results = lintCases("noAs", {
      valid: [
        "const pair = <const>[1, 2];",
        "const pair = [1, 2] as const;",
        "const checked = value satisfies Expected;",
      ],
      invalid: [
        "const typed = <Expected>value;",
        "const typed = <unknown>value;",
        "const typed = <Constant>value;",
        "const typed = <Expected>(<unknown>value);",
        "const typed = value as Expected;",
      ],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
    expect(
      lintFixtures("noAs", { "value.ts": "const typed = <Expected>value;" }).get("value.ts"),
    ).toEqual([{ line: 1, message: "Avoid as assertions. Use satisfies instead." }]);
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

  test("rejects Vitest and Jest module mocks and method spies", () => {
    for (const api of ["vi", "jest"] as const) {
      for (const method of ["mock", "spyOn"] as const) {
        const diagnostics = Testing.runRule(
          noModuleMocks,
          "CallExpression",
          Testing.callOfMember(api, method),
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.diagnostic.message).toContain("Effect service test Layer");
      }
    }

    expect(
      Testing.runRule(noModuleMocks, "CallExpression", Testing.callOfMember("testHarness", "mock")),
    ).toHaveLength(0);
  });

  test("rejects async functions and await", () => {
    const asyncFunction = { ...Testing.arrowFn(), async: true };
    const awaitExpression = {
      type: "AwaitExpression",
      argument: Testing.callExpr("work"),
    };
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
    const results = lintCases("noNewPromise", {
      valid: [],
      invalid: ["new Promise(run);", "Promise.all([]);"],
    });
    expect(results).toEqual({ reportedValid: [], missedInvalid: [] });
  });

  test("rejects ternaries but does not own ordinary if statements", () => {
    const ternary = {
      type: "ConditionalExpression",
      test: Testing.id("condition"),
      consequent: Testing.id("yes"),
      alternate: Testing.id("no"),
    };
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
    };
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
    };
    const awaited = { type: "AwaitExpression", argument: imported };
    const binding = {
      type: "VariableDeclarator",
      id: Testing.id("moduleNamespace"),
      init: awaited,
    };
    Object.defineProperty(imported, "parent", { value: awaited });
    Object.defineProperty(awaited, "parent", { value: binding });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", imported)).toHaveLength(0);
  });

  test("allows direct Effect promise boundaries and named destructuring", () => {
    const importedByEffect = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    };
    const callback = Testing.arrowFn(importedByEffect);
    const boundary = Testing.callOfMember("Effect", "tryPromise", [callback]);
    Object.defineProperty(importedByEffect, "parent", { value: callback });
    Object.defineProperty(callback, "parent", { value: boundary });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", importedByEffect)).toHaveLength(0);

    const importedByBinding = {
      type: "ImportExpression",
      source: Testing.strLiteral("./module.js"),
    };
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
    };
    Object.defineProperty(importedByBinding, "parent", { value: destructuring });
    expect(Testing.runRule(noDynamicImports, "ImportExpression", importedByBinding)).toHaveLength(
      0,
    );
  });
});
