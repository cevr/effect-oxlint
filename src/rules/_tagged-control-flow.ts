import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { ancestors } from "./_ast-ancestors.js";

export interface TagComparison {
  readonly subject: string;
  readonly tag: string;
}

const expressionKey = (node: ESTree.Expression): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  if (node.type === "ThisExpression") return Option.some("this");
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") {
    return Option.none();
  }
  const property = node.property.name;
  return Option.map(expressionKey(node.object), (object) => `${object}.${property}`);
};

const stringLiteral = (node: ESTree.Expression): Option.Option<string> => {
  if (node.type !== "Literal" || !Predicate.isString(node.value)) return Option.none();
  return Option.some(node.value);
};

const taggedSubject = (node: ESTree.Expression): Option.Option<string> => {
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier" ||
    node.property.name !== "_tag"
  ) {
    return Option.none();
  }
  return expressionKey(node.object);
};

/** `subjectSide._tag === "Tag"` read from one orientation of the comparison. */
const orientedComparison = (
  subjectSide: ESTree.Expression,
  tagSide: ESTree.Expression,
): Option.Option<TagComparison> =>
  Option.all({ subject: taggedSubject(subjectSide), tag: stringLiteral(tagSide) });

export const tagComparison = (node: ESTree.Expression): Option.Option<TagComparison> => {
  if (node.type !== "BinaryExpression" || node.operator !== "===") return Option.none();
  const { left, right } = node;
  return Option.orElse(orientedComparison(left, right), () => orientedComparison(right, left));
};

export const tagComparisonsInOr = (
  node: ESTree.Expression,
): Option.Option<ReadonlyArray<TagComparison>> => {
  if (node.type === "LogicalExpression" && node.operator === "||") {
    return Option.zipWith(
      tagComparisonsInOr(node.left),
      tagComparisonsInOr(node.right),
      (left, right) => [...left, ...right],
    );
  }
  return Option.map(tagComparison(node), (comparison) => [comparison]);
};

export const hasOneTaggedSubject = (comparisons: ReadonlyArray<TagComparison>): boolean =>
  comparisons.length >= 2 &&
  Option.exists(Arr.head(comparisons), (first) =>
    comparisons.every((comparison) => comparison.subject === first.subject),
  );

export const isEffectCall = (node: ESTree.CallExpression, operation: string): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Effect" &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === operation;

const isFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

export interface EffectCallbackLocation {
  readonly argumentCount: number;
  readonly index: number;
}

const callbackLocation = (
  callback: ESTree.ArrowFunctionExpression | ESTree.Function,
  operation: string,
): Option.Option<EffectCallbackLocation> => {
  const call = callback.parent;
  if (call?.type !== "CallExpression" || !isEffectCall(call, operation)) return Option.none();
  const index = call.arguments.indexOf(callback);
  if (index < 0) return Option.none();
  return Option.some({ argumentCount: call.arguments.length, index });
};

/** Where the nearest enclosing function sits among the arguments of an `Effect.<operation>` call. */
export const effectCallbackLocation = (
  node: ESTree.Node,
  operation: string,
): Option.Option<EffectCallbackLocation> =>
  Option.flatMap(Arr.findFirst(ancestors(node), isFunction), (callback) =>
    callbackLocation(callback, operation),
  );

/** `Predicate.isTagged`, as a member of the `Predicate` namespace. */
const isPredicateIsTagged = (node: ESTree.Node): boolean =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.object.type === "Identifier" &&
  node.object.name === "Predicate" &&
  node.property.type === "Identifier" &&
  node.property.name === "isTagged";

/** The subject of `Predicate.isTagged(subject, "Tag")` or `Predicate.isTagged("Tag")(subject)`. */
const isTaggedCallSubject = (node: ESTree.Expression): Option.Option<string> => {
  if (node.type !== "CallExpression") return Option.none();
  const { callee } = node;
  if (isPredicateIsTagged(callee) && node.arguments.length === 2) {
    return Option.flatMap(Arr.head(node.arguments), argumentKey);
  }
  if (
    callee.type === "CallExpression" &&
    isPredicateIsTagged(callee.callee) &&
    callee.arguments.length === 1 &&
    node.arguments.length === 1
  ) {
    return Option.flatMap(Arr.head(node.arguments), argumentKey);
  }
  return Option.none();
};

const argumentKey = (argument: ESTree.Argument): Option.Option<string> => {
  if (argument.type === "SpreadElement") return Option.none();
  return expressionKey(argument);
};

/**
 * Whether `node` tests `subject` by its tag: `subject._tag === "Tag"`,
 * `Predicate.isTagged(subject, "Tag")` or `Predicate.isTagged("Tag")(subject)`,
 * alone or joined by `||`.
 */
export const isTagTestOn = (node: ESTree.Expression, subject: string): boolean => {
  if (node.type === "LogicalExpression" && node.operator === "||") {
    return isTagTestOn(node.left, subject) && isTagTestOn(node.right, subject);
  }
  return (
    Option.exists(tagComparison(node), (comparison) => comparison.subject === subject) ||
    Option.contains(isTaggedCallSubject(node), subject)
  );
};

/** The handler argument of a broad Effect recovery: `Effect.catch` or `Effect.catchAll`, data-first or piped. */
export const broadCatchHandler = (node: ESTree.CallExpression): Option.Option<ESTree.Argument> => {
  if (!isEffectCall(node, "catch") && !isEffectCall(node, "catchAll")) return Option.none();
  let handlerIndex = 1;
  if (node.arguments.length === 1) handlerIndex = 0;
  return Arr.get(node.arguments, handlerIndex);
};

/** Whether the nearest enclosing function is the handler of `Effect.catch` or `Effect.catchAll`. */
export const isInsideBroadCatchHandler = (node: ESTree.Node): boolean =>
  ["catch", "catchAll"].some((operation) =>
    Option.exists(effectCallbackLocation(node, operation), (location) => {
      let handlerIndex = 1;
      if (location.argumentCount === 1) handlerIndex = 0;
      return location.index === handlerIndex;
    }),
  );

export const isInsideCatchAllHandler = (node: ESTree.Node): boolean =>
  Option.exists(effectCallbackLocation(node, "catchAll"), (location) => {
    let handlerIndex = 1;
    if (location.argumentCount === 1) handlerIndex = 0;
    return location.index === handlerIndex;
  });

export const taggedSwitchSubject = (node: ESTree.SwitchStatement): Option.Option<string> =>
  taggedSubject(node.discriminant);
