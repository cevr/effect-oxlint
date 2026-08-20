/** Prefer Effect's tagged failure recovery over manual tag predicates. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isEffectCall, tagComparisonsInOr } from "./_tagged-control-flow.js";

const returnedExpression = (
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
): ESTree.Expression | null => {
  if (fn.body === null) return null;
  if (fn.body.type !== "BlockStatement") return fn.body;
  if (fn.body.body.length !== 1) return null;
  const statement = fn.body.body[0];
  if (statement?.type !== "ReturnStatement" || statement.argument === null) return null;
  return statement.argument;
};

const hasManualTagPredicate = (argument: ESTree.Argument | undefined): boolean => {
  if (argument?.type !== "ArrowFunctionExpression" && argument?.type !== "FunctionExpression") {
    return false;
  }
  const parameter = argument.params[0];
  if (parameter?.type !== "Identifier") return false;
  const expression = returnedExpression(argument);
  if (expression === null) return false;
  const comparisons = tagComparisonsInOr(expression);
  if (comparisons === null || comparisons.length === 0) return false;
  return comparisons.every((comparison) => comparison.subject === parameter.name);
};

export const preferCatchTag = Rule.define({
  name: "prefer-catch-tag",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Effect.catchTag or Effect.catchTags for tagged failures.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (!isEffectCall(node, "catchIf")) return Effect.void;
        let predicateIndex = 1;
        if (node.arguments.length === 2) predicateIndex = 0;
        const predicate = node.arguments[predicateIndex];
        if (!hasManualTagPredicate(predicate)) return Effect.void;
        return context.report(
          Diagnostic.make({
            node,
            message:
              "Use Effect.catchTag for one tagged failure or Effect.catchTags for multiple tagged failures.",
          }),
        );
      },
    };
  },
});
