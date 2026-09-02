import { describe, expect, test } from "bun:test";

import {
  cognitiveComplexity,
  halstead,
  halsteadDifficulty,
} from "../src/rules/_function-metrics.js";
import { maxCognitiveComplexity, maxHalsteadDifficulty } from "../src/rules/index.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

const logical = (operator: "&&" | "||" | "??", left: unknown, right: unknown) =>
  ({ type: "LogicalExpression", operator, left, right }) as never;

const forOf = (body: unknown) =>
  ({
    type: "ForOfStatement",
    await: false,
    left: Testing.id("item"),
    right: Testing.id("items"),
    body,
  }) as never;

const labelledBreak = () =>
  ({ type: "BreakStatement", label: { type: "Identifier", name: "outer" } }) as never;

const conditional = (condition: unknown, consequent: unknown, alternate: unknown) =>
  ({ type: "ConditionalExpression", test: condition, consequent, alternate }) as never;

const returnOne = () => Testing.returnStmt(Testing.numLiteral(1));

/** `(a, b) => { if (a) { if (b) { return 1 } else { return 1 } } }` */
const nestedIf = Testing.arrowFn(
  Testing.blockStmt([
    Testing.ifStmt(
      Testing.id("a"),
      Testing.blockStmt([
        Testing.ifStmt(
          Testing.id("b"),
          Testing.blockStmt([returnOne()]),
          Testing.blockStmt([returnOne()]),
        ),
      ]),
    ),
  ]),
  [Testing.id("a"), Testing.id("b")],
);

describe("cognitive complexity", () => {
  test("charges nesting for inner branches and one for else", () => {
    expect(cognitiveComplexity(nestedIf)).toBe(4);
  });

  test("charges one per else-if without nesting", () => {
    const chain = Testing.arrowFn(
      Testing.blockStmt([
        Testing.ifStmt(
          Testing.id("a"),
          Testing.blockStmt([returnOne()]),
          Testing.ifStmt(
            Testing.id("b"),
            Testing.blockStmt([returnOne()]),
            Testing.ifStmt(Testing.id("c"), Testing.blockStmt([returnOne()])),
          ),
        ),
      ]),
    );
    expect(cognitiveComplexity(chain)).toBe(3);
  });

  test("charges one per run of like logical operators", () => {
    const mixed = Testing.arrowFn(
      logical(
        "||",
        logical("&&", logical("&&", Testing.id("a"), Testing.id("b")), Testing.id("c")),
        Testing.id("d"),
      ),
    );
    expect(cognitiveComplexity(mixed)).toBe(2);

    const single = Testing.arrowFn(
      logical("&&", logical("&&", Testing.id("a"), Testing.id("b")), Testing.id("c")),
    );
    expect(cognitiveComplexity(single)).toBe(1);
  });

  test("charges nesting inside loops, ternaries, and labelled jumps", () => {
    const loop = Testing.arrowFn(
      Testing.blockStmt([
        forOf(
          Testing.blockStmt([
            Testing.ifStmt(Testing.id("a"), Testing.blockStmt([labelledBreak()])),
            Testing.returnStmt(conditional(Testing.id("b"), Testing.id("c"), Testing.id("d"))),
          ]),
        ),
      ]),
    );
    // for (+1) → if (+2) → labelled break (+1), ternary (+2)
    expect(cognitiveComplexity(loop)).toBe(6);
  });

  test("measures nested functions as their own unit", () => {
    const outer = Testing.arrowFn(Testing.blockStmt([Testing.returnStmt(nestedIf)]));
    expect(cognitiveComplexity(outer)).toBe(0);
  });
});

describe("halstead", () => {
  test("counts operators and operands of `x + x * x`", () => {
    const fn = Testing.arrowFn(
      Testing.binaryExpr(
        "+",
        Testing.id("x"),
        Testing.binaryExpr("*", Testing.id("x"), Testing.id("x")),
      ),
      [Testing.id("x")],
    );
    const counts = halstead(fn);
    expect(counts).toEqual({
      distinctOperators: 2,
      totalOperators: 2,
      distinctOperands: 1,
      totalOperands: 4,
    });
    expect(halsteadDifficulty(counts)).toBe(4);
  });

  test("treats a nested function as one operator of the enclosing unit", () => {
    const outer = Testing.arrowFn(Testing.blockStmt([Testing.returnStmt(nestedIf)]));
    expect(halstead(outer)).toEqual({
      distinctOperators: 2,
      totalOperators: 2,
      distinctOperands: 0,
      totalOperands: 0,
    });
    expect(halsteadDifficulty(halstead(outer))).toBe(0);
  });

  test("ignores type annotations", () => {
    const typed = Testing.arrowFn(
      { ...Testing.id("x"), typeAnnotation: Testing.tsTypeRef("Wide") },
      [{ ...Testing.id("x"), typeAnnotation: Testing.tsTypeRef("Wide") }],
    );
    expect(halstead(typed).distinctOperands).toBe(1);
    expect(halstead(typed).totalOperands).toBe(2);
  });
});

describe("complexity rules", () => {
  test("report a function above the configured cognitive limit", () => {
    const diagnostics = Testing.runRule(
      maxCognitiveComplexity,
      "ArrowFunctionExpression",
      nestedIf,
      {
        options: [{ max: 3 }],
      },
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.diagnostic.messageId).toBe("tooComplex");
    expect(diagnostics[0]?.diagnostic.data).toEqual({ value: "4", max: "3" });
  });

  test("accept a function at the configured cognitive limit", () => {
    expect(
      Testing.runRule(maxCognitiveComplexity, "ArrowFunctionExpression", nestedIf, {
        options: [{ max: 4 }],
      }),
    ).toHaveLength(0);
  });

  test("fall back to the recommended limit without options", () => {
    expect(
      Testing.runRule(maxCognitiveComplexity, "ArrowFunctionExpression", nestedIf),
    ).toHaveLength(0);
    expect(maxCognitiveComplexity.meta?.docs?.["recommendedOptions"]).toEqual({ max: 21 });
    expect(maxCognitiveComplexity.meta?.defaultOptions).toEqual([{ max: 21 }]);
    expect(maxHalsteadDifficulty.meta?.docs?.["recommendedOptions"]).toEqual({ max: 79 });
    expect(maxHalsteadDifficulty.meta?.defaultOptions).toEqual([{ max: 79 }]);
  });

  test("report a function above the configured Halstead limit with one decimal", () => {
    const fn = Testing.arrowFn(
      Testing.binaryExpr(
        "+",
        Testing.id("x"),
        Testing.binaryExpr("*", Testing.id("x"), Testing.id("y")),
      ),
      [Testing.id("x"), Testing.id("y")],
    );
    // η1 = 2, N2 = 5, η2 = 2 → 2.5
    const diagnostics = Testing.runRule(maxHalsteadDifficulty, "ArrowFunctionExpression", fn, {
      options: [{ max: 2 }],
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.diagnostic.data).toEqual({ value: "2.5", max: "2" });
  });
});
