import { describe, expect, test } from "bun:test";

import { preferEffectFn } from "../src/rules/prefer-effect-fn.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

const directWithSpan = () => {
  const generated = Testing.callOfMember("Effect", "gen", [Testing.arrowFn()]);
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: generated,
      property: Testing.id("withSpan"),
      computed: false,
      optional: false,
    },
    arguments: [Testing.strLiteral("Example.run")],
  } as never;
};

const pipedWithSpan = () => {
  const generated = Testing.callOfMember("Effect", "gen", [Testing.arrowFn()]);
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: generated,
      property: Testing.id("pipe"),
      computed: false,
      optional: false,
    },
    arguments: [Testing.callOfMember("Effect", "withSpan", [Testing.strLiteral("Example.run")])],
  } as never;
};

describe("prefer Effect.fn", () => {
  test("rejects a span attached directly to Effect.gen", () => {
    expect(Testing.runRule(preferEffectFn, "CallExpression", directWithSpan())).toHaveLength(1);
  });

  test("rejects Effect.gen piped directly into Effect.withSpan", () => {
    expect(Testing.runRule(preferEffectFn, "CallExpression", pipedWithSpan())).toHaveLength(1);
  });

  test("allows an unspanned generator and an Effect.fn operation", () => {
    expect(
      Testing.runRule(
        preferEffectFn,
        "CallExpression",
        Testing.callOfMember("Effect", "gen", [Testing.arrowFn()]),
      ),
    ).toHaveLength(0);
    expect(
      Testing.runRule(
        preferEffectFn,
        "CallExpression",
        Testing.callOfMember("Effect", "fn", [Testing.strLiteral("Example.run")]),
      ),
    ).toHaveLength(0);
  });
});
