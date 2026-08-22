/** Prefer Effect's tagged failure recovery over manual tag predicates. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isEffectCall, tagComparisonsInOr, taggedSwitchSubject } from "./_tagged-control-flow.js";

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

const isFunction = (
  argument: ESTree.Argument | undefined,
): argument is ESTree.ArrowFunctionExpression | ESTree.Function =>
  argument?.type === "ArrowFunctionExpression" || argument?.type === "FunctionExpression";

const hasTagCondition = (node: ESTree.IfStatement, parameter: string): boolean => {
  const comparisons = tagComparisonsInOr(node.test);
  if (comparisons === null || comparisons.length === 0) return false;
  return comparisons.every((comparison) => comparison.subject === parameter);
};

const hasTagSwitch = (node: ESTree.SwitchStatement, parameter: string): boolean => {
  if (taggedSwitchSubject(node) !== parameter) return false;
  return node.cases.some(
    (switchCase) =>
      switchCase.test?.type === "Literal" && typeof switchCase.test.value === "string",
  );
};

const hasManualTagDispatch = (argument: ESTree.Argument | undefined): boolean => {
  if (!isFunction(argument) || argument.body?.type !== "BlockStatement") return false;
  const parameter = argument.params[0];
  if (parameter?.type !== "Identifier") return false;

  return argument.body.body.some((statement) => {
    if (statement.type === "IfStatement") return hasTagCondition(statement, parameter.name);
    if (statement.type === "SwitchStatement") return hasTagSwitch(statement, parameter.name);
    return false;
  });
};

const catchAllHandler = (node: ESTree.CallExpression): ESTree.Argument | undefined => {
  if (!isEffectCall(node, "catchAll")) return undefined;
  let handlerIndex = 1;
  if (node.arguments.length === 1) handlerIndex = 0;
  return node.arguments[handlerIndex];
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
        if (isEffectCall(node, "catchIf")) {
          let predicateIndex = 1;
          if (node.arguments.length === 2) predicateIndex = 0;
          const predicate = node.arguments[predicateIndex];
          if (!hasManualTagPredicate(predicate)) return Effect.void;
        } else if (!hasManualTagDispatch(catchAllHandler(node))) {
          return Effect.void;
        }
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
