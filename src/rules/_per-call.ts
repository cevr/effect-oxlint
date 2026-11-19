/**
 * Shared by the per-call construction rules (`noFormatterPerCall`,
 * `noRegExpPerCall`): whether a construction runs inside a function, and
 * whether its arguments are the same on every call, so it can be built once
 * at module scope.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { ancestorsOf, isFunction, walk, type FunctionNode } from "./_anti-slop-effect.js";
import { patternNames } from "./_loops.js";

/** The functions around `node`, nearest first; empty at module scope. */
export const enclosingFunctions = (node: ESTree.Node): ReadonlyArray<FunctionNode> =>
  [...ancestorsOf(node)].filter(isFunction);

/** Names bound by the functions' parameters and by declarations inside their bodies. */
const localNames = (functions: ReadonlyArray<FunctionNode>): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const fn of functions) {
    fn.params.forEach((param) => patternNames(param).forEach((name) => names.add(name)));
    walk(fn.body ?? fn, (node) => {
      if (node.type === "VariableDeclarator") patternNames(node.id).forEach((n) => names.add(n));
      if (node.type === "FunctionDeclaration" && node.id) names.add(node.id.name);
      if (node.type === "ClassDeclaration" && node.id) names.add(node.id.name);
      if (node.type === "CatchClause" && node.param) {
        patternNames(node.param).forEach((n) => names.add(n));
      }
      return true;
    });
  }
  return names;
};

/**
 * Whether `node` evaluates to the same value on every call: literals, and
 * reads of names bound outside every enclosing function, combined by
 * operators, objects, arrays and templates. A call, `new`, `this` or a
 * function-local name makes it vary.
 */
const constantIn = (node: ESTree.Node, locals: ReadonlySet<string>): boolean => {
  const self = (n: ESTree.Node): boolean => constantIn(n, locals);
  switch (node.type) {
    case "Literal":
      return true;
    case "Identifier":
      return !locals.has(node.name);
    case "TemplateLiteral":
      return node.expressions.every(self);
    case "MemberExpression":
      return self(node.object) && (!node.computed || self(node.property));
    case "ObjectExpression":
      return node.properties.every(self);
    case "Property":
      return (!node.computed || self(node.key)) && self(node.value);
    case "ArrayExpression":
      return node.elements.every((elementOrHole) =>
        Option.match(Option.fromNullishOr(elementOrHole), { onNone: () => true, onSome: self }),
      );
    case "SpreadElement":
      return self(node.argument);
    case "UnaryExpression":
      return node.operator !== "delete" && self(node.argument);
    case "BinaryExpression":
    case "LogicalExpression":
      return self(node.left) && self(node.right);
    case "ConditionalExpression":
      return self(node.test) && self(node.consequent) && self(node.alternate);
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "ParenthesizedExpression":
      return self(node.expression);
    default:
      return false;
  }
};

/** Whether every argument is the same on every call of the enclosing functions. */
export const constantArguments = (
  args: ReadonlyArray<ESTree.Node>,
  functions: ReadonlyArray<FunctionNode>,
): boolean => {
  const locals = localNames(functions);
  return args.every((arg) => constantIn(arg, locals));
};
