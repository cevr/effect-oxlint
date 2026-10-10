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
  };
};

const pipedWithSpan = (namespace = "Effect", ...transforms: ReadonlyArray<string>) => {
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
      ...transforms.map((transform) =>
        Testing.callOfMember(namespace, transform, [Testing.arrowFn()]),
      ),
      Testing.callOfMember(namespace, "withSpan", [Testing.strLiteral("Example.run")]),
    ],
  };
};

/** The parent link oxlint sets: the holder's type and the slot holding the node. */
type Holder = { readonly type: string; readonly body?: unknown; readonly argument?: unknown; readonly delegate?: boolean };

/** Places `node` in `parent`, as oxlint's parent links would. */
const within = <N extends object>(node: N, parent: Holder): N => {
  Object.assign(node, { parent });
  return node;
};
const arrowBody = <N extends object>(node: N): N =>
  within(node, { type: "ArrowFunctionExpression", body: node });
const returned = <N extends object>(node: N): N =>
  within(node, { type: "ReturnStatement", argument: node });

describe("prefer Effect.fn", () => {
  test("rejects a span attached directly to Effect.gen", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport()],
        ["CallExpression", arrowBody(directWithSpan())],
      ]),
    ).toHaveLength(1);
  });

  test("rejects Effect.gen piped directly into Effect.withSpan", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport()],
        ["CallExpression", returned(pipedWithSpan())],
      ]),
    ).toHaveLength(1);
  });

  test("rejects Effect.gen piped through transforms into Effect.withSpan", () => {
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport("Fx")],
        ["CallExpression", arrowBody(pipedWithSpan("Fx", "map"))],
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
        ["CallExpression", returned(pipedWithSpan("Fx"))],
      ]),
    ).toHaveLength(1);
    expect(
      Testing.runRule(preferEffectFn, "CallExpression", returned(pipedWithSpan())),
    ).toHaveLength(0);
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

  test("allows a spanned generator held as a value, where Effect.fn would need invoking", () => {
    const parents = [
      { type: "VariableDeclarator" },
      { type: "Property" },
      { type: "YieldExpression", delegate: true },
      { type: "ArrowFunctionExpression", body: { type: "BlockStatement" } },
    ];
    for (const parent of parents) {
      expect(
        Testing.runRuleMulti(preferEffectFn, [
          ["ImportDeclaration", effectImport()],
          ["CallExpression", within(pipedWithSpan(), parent)],
        ]),
      ).toHaveLength(0);
    }
    expect(
      Testing.runRuleMulti(preferEffectFn, [
        ["ImportDeclaration", effectImport()],
        ["CallExpression", within(directWithSpan(), { type: "VariableDeclarator" })],
      ]),
    ).toHaveLength(0);
  });
});
