/** Prefer Effect's tagged failure recovery over manual tag predicates. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isEffectCall, tagComparisonsInOr, taggedSwitchSubject } from "./_tagged-control-flow.js";

const isFunction = (
  argument: ESTree.Argument,
): argument is ESTree.ArrowFunctionExpression | ESTree.Function =>
  argument.type === "ArrowFunctionExpression" || argument.type === "FunctionExpression";

const isIdentifier = (parameter: ESTree.ParamPattern): parameter is ESTree.BindingIdentifier =>
  parameter.type === "Identifier";

/** The name of a callback's first parameter when it is a plain identifier. */
const identifierParameter = (
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
): Option.Option<string> =>
  Arr.head(fn.params).pipe(
    Option.filter(isIdentifier),
    Option.map((parameter) => parameter.name),
  );

/** The expression a callback returns when its body is that expression or a lone `return`. */
const returnedExpression = (
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
): Option.Option<ESTree.Expression> =>
  Option.flatMap(Option.fromNullishOr(fn.body), (body) => {
    if (body.type !== "BlockStatement") return Option.some(body);
    const [statement] = body.body;
    if (body.body.length !== 1 || statement?.type !== "ReturnStatement") return Option.none();
    return Option.fromNullishOr(statement.argument);
  });

/** Whether `expression` is one or more `parameter._tag === "Tag"` checks joined by `||`. */
const isTagCheckOn = (expression: ESTree.Expression, parameter: string): boolean =>
  Option.exists(tagComparisonsInOr(expression), (comparisons) =>
    comparisons.every((comparison) => comparison.subject === parameter),
  );

const hasManualTagPredicate = (argument: ESTree.Argument): boolean =>
  isFunction(argument) &&
  Option.exists(
    Option.all([identifierParameter(argument), returnedExpression(argument)]),
    ([parameter, expression]) => isTagCheckOn(expression, parameter),
  );

const hasTagSwitch = (node: ESTree.SwitchStatement, parameter: string): boolean => {
  if (!Option.contains(taggedSwitchSubject(node), parameter)) return false;
  return node.cases.some(
    (switchCase) =>
      switchCase.test?.type === "Literal" && Predicate.isString(switchCase.test.value),
  );
};

const hasManualTagDispatch = (argument: ESTree.Argument): boolean => {
  if (!isFunction(argument) || argument.body?.type !== "BlockStatement") return false;
  const statements = argument.body.body;
  return Option.exists(identifierParameter(argument), (parameter) =>
    statements.some((statement) => {
      if (statement.type === "IfStatement") return isTagCheckOn(statement.test, parameter);
      if (statement.type === "SwitchStatement") return hasTagSwitch(statement, parameter);
      return false;
    }),
  );
};

const catchAllHandler = (node: ESTree.CallExpression): Option.Option<ESTree.Argument> => {
  if (!isEffectCall(node, "catchAll")) return Option.none();
  let handlerIndex = 1;
  if (node.arguments.length === 1) handlerIndex = 0;
  return Arr.get(node.arguments, handlerIndex);
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
          const predicate = Arr.get(node.arguments, predicateIndex);
          if (!Option.exists(predicate, hasManualTagPredicate)) return Effect.void;
        } else if (!Option.exists(catchAllHandler(node), hasManualTagDispatch)) {
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
