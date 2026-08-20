import type { ESTree } from "@oxlint/plugins";

export interface TagComparison {
  readonly subject: string;
  readonly tag: string;
}

const expressionKey = (node: ESTree.Expression): string | null => {
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") {
    return null;
  }
  const object = expressionKey(node.object);
  if (object === null) return null;
  return `${object}.${node.property.name}`;
};

const stringLiteral = (node: ESTree.Expression): string | null => {
  if (node.type !== "Literal") return null;
  if (typeof node.value !== "string") return null;
  return node.value;
};

const taggedSubject = (node: ESTree.Expression): string | null => {
  if (
    node.type !== "MemberExpression" ||
    node.computed ||
    node.property.type !== "Identifier" ||
    node.property.name !== "_tag"
  ) {
    return null;
  }
  return expressionKey(node.object);
};

export const tagComparison = (node: ESTree.Expression): TagComparison | null => {
  if (node.type !== "BinaryExpression" || node.operator !== "===") return null;

  const leftSubject = taggedSubject(node.left);
  const rightTag = stringLiteral(node.right);
  if (leftSubject !== null && rightTag !== null) {
    return { subject: leftSubject, tag: rightTag };
  }

  const rightSubject = taggedSubject(node.right);
  const leftTag = stringLiteral(node.left);
  if (rightSubject === null || leftTag === null) return null;
  return { subject: rightSubject, tag: leftTag };
};

export const tagComparisonsInOr = (
  node: ESTree.Expression,
): ReadonlyArray<TagComparison> | null => {
  if (node.type === "LogicalExpression" && node.operator === "||") {
    const left = tagComparisonsInOr(node.left);
    const right = tagComparisonsInOr(node.right);
    if (left === null || right === null) return null;
    return [...left, ...right];
  }

  const comparison = tagComparison(node);
  if (comparison === null) return null;
  return [comparison];
};

export const hasOneTaggedSubject = (comparisons: ReadonlyArray<TagComparison>): boolean => {
  const first = comparisons[0];
  if (first === undefined || comparisons.length < 2) return false;
  return comparisons.every((comparison) => comparison.subject === first.subject);
};

export const isEffectCall = (node: ESTree.CallExpression, operation: string): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Effect" &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === operation;

const isFunction = (
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

export interface EffectCallbackLocation {
  readonly argumentCount: number;
  readonly index: number;
}

export const effectCallbackLocation = (
  node: ESTree.Node,
  operation: string,
): EffectCallbackLocation | null => {
  let current: ESTree.Node | null | undefined = node.parent;
  while (current !== undefined && current !== null) {
    if (isFunction(current)) {
      const call = current.parent;
      if (call?.type !== "CallExpression" || !isEffectCall(call, operation)) return null;
      const index = call.arguments.indexOf(current);
      if (index < 0) return null;
      return { argumentCount: call.arguments.length, index };
    }
    current = current.parent;
  }
  return null;
};

export const isInsideCatchAllHandler = (node: ESTree.Node): boolean => {
  const location = effectCallbackLocation(node, "catchAll");
  if (location === null) return false;
  let handlerIndex = 1;
  if (location.argumentCount === 1) handlerIndex = 0;
  return location.index === handlerIndex;
};

export const taggedSwitchSubject = (node: ESTree.SwitchStatement): string | null =>
  taggedSubject(node.discriminant);
