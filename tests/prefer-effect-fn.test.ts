import { describe, expect, test } from "bun:test";

import { preferEffectFn } from "../src/rules/prefer-effect-fn.js";
import { Testing } from "../src/vendor/effect-oxlint/index.js";

const effectImport = (local = "Effect") =>
  Testing.importDeclWithSpecifiers("effect/Effect", [Testing.importNamespaceSpecifier(local)]);

const directWithSpan = (namespace = "Effect") => {
  const generated = Testing.callOfMember(namespace, "gen", [Testing.arrowFn()]);
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

const pipedWithSpan = (namespace = "Effect", withTransform = false) => {
  const generated = Testing.callOfMember(namespace, "gen", [Testing.arrowFn()]);
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: generated,
      property: Testing.id("pipe"),
      computed: false,
      optional: false,
    },
    arguments: [
      ...(withTransform ? [Testing.callOfMember(namespace, "map", [Testing.arrowFn()])] : []),
      Testing.callOfMember(namespace, "withSpan", [Testing.strLiteral("Example.run")]),
    ],
  } as never;
};

describe("prefer Effect.fn", () => {
  test("rejects a span attached directly to Effect.gen", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport()],
        ["CallExpression", directWithSpan()],
      ]),
    ).toHaveLength(1);
  });

  test("rejects Effect.gen piped directly into Effect.withSpan", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport()],
        ["CallExpression", pipedWithSpan()],
      ]),
    ).toHaveLength(1);
  });

  test("rejects Effect.gen piped through transforms into Effect.withSpan", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport("Fx")],
        ["CallExpression", pipedWithSpan("Fx", true)],
      ]),
    ).toHaveLength(1);
  });

  test("rejects an aliased Effect import and ignores an unrelated Effect binding", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        [
          "ImportDeclaration",
          Testing.importDeclWithSpecifiers("effect", [Testing.importSpecifier("Effect", "Fx")]),
        ],
        ["CallExpression", pipedWithSpan("Fx")],
      ]),
    ).toHaveLength(1);
    expect(Testing.runRule(preferEffectFn, "CallExpression", pipedWithSpan())).toHaveLength(0);
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
