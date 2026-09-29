/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

function unwrapParentheses(node: ESTree.Expression): ESTree.Expression {
  let current = node;
  while (current.type === "ParenthesizedExpression") current = current.expression;
  return current;
}

function isEmptyObjectExpression(node: ESTree.Expression): boolean {
  return node.type === "ObjectExpression" && node.properties.length === 0;
}

function isConditionalEmptyObjectSpread(node: ESTree.Expression): boolean {
  const conditional = unwrapParentheses(node);
  return (
    conditional.type === "ConditionalExpression" &&
    (isEmptyObjectExpression(conditional.consequent) ||
      isEmptyObjectExpression(conditional.alternate))
  );
}

/** Ban conditional empty-object spreads without changing their omission semantics. */
export const noConditionalEmptyObjectSpread = Rule.define({
  name: "no-conditional-empty-object-spread",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Disallow object spreads that conditionally spread an empty object to omit fields.",
    messages: {
      avoid:
        "Do not use conditional empty-object spreads. Prefer a direct property or build the object in separate statements.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      // Local change: the ternary is an early return.
      SpreadElement: (node: ESTree.SpreadElement) => {
        if (
          node.parent?.type !== "ObjectExpression" ||
          !isConditionalEmptyObjectSpread(node.argument)
        ) {
          return Effect.void;
        }
        return context.report(Diagnostic.fromId({ node, messageId: "avoid" }));
      },
    };
  },
});
