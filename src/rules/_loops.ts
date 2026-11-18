/**
 * Loops for the counted-cost rules: a loop statement, or the callback of an
 * array iteration method (`xs.map(…)`, `xs.forEach(…)`).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { ancestorsOf, isFunction } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";
import { arrayMethodTarget } from "./_anti-slop-array-method.js";

/** Array methods that call their callback once per element. */
export const iterationMethods: ReadonlySet<string> = new Set([
  "map",
  "forEach",
  "filter",
  "flatMap",
  "reduce",
  "some",
  "every",
  "find",
  "findIndex",
]);

/** A loop around a node: what it iterates and the names it binds per element. */
export interface Loop {
  readonly node: ESTree.Node;
  /** The iterated collection's text-bearing node, when there is one. */
  readonly collection: Option.Option<ESTree.Node>;
  /** Names bound for each element: the callback's parameters or the `for…of` variable. */
  readonly elementNames: ReadonlySet<string>;
}

/** Identifier names a pattern binds. */
export const patternNames = (pattern: ESTree.Node): ReadonlyArray<string> => {
  if (pattern.type === "Identifier") return [pattern.name];
  if (pattern.type === "ObjectPattern") {
    return pattern.properties.flatMap((property) => {
      if (property.type === "RestElement") return patternNames(property.argument);
      return patternNames(property.value);
    });
  }
  if (pattern.type === "ArrayPattern") {
    return pattern.elements.flatMap((element) =>
      Option.match(Option.fromNullishOr(element), { onNone: () => [], onSome: patternNames }),
    );
  }
  if (pattern.type === "AssignmentPattern") return patternNames(pattern.left);
  if (pattern.type === "VariableDeclaration") {
    return pattern.declarations.flatMap((declaration) => patternNames(declaration.id));
  }
  return [];
};

/** The iteration call a callback is passed to, as the loop it makes. */
const callbackLoop = (fn: FunctionNode): Option.Option<Loop> => {
  const call = fn.parent;
  if (call?.type !== "CallExpression" || call.arguments[0] !== fn) return Option.none();
  return Option.flatMap(arrayMethodTarget(call.callee), (method) => {
    if (!iterationMethods.has(method.name)) return Option.none();
    return Option.some({
      node: call,
      collection: Option.some(method.object),
      elementNames: new Set(fn.params.flatMap(patternNames)),
    });
  });
};

const statementLoop = (node: ESTree.Node): Option.Option<Loop> => {
  if (node.type === "ForOfStatement" || node.type === "ForInStatement") {
    return Option.some({
      node,
      collection: Option.some(node.right),
      elementNames: new Set(patternNames(node.left)),
    });
  }
  if (
    node.type === "ForStatement" ||
    node.type === "WhileStatement" ||
    node.type === "DoWhileStatement"
  ) {
    return Option.some({ node, collection: Option.none(), elementNames: new Set() });
  }
  return Option.none();
};

/**
 * The nearest loop around `node` within its own function: a loop statement
 * between it and its function, or the iteration call its function is the
 * callback of. A function that is not an iteration callback ends the search.
 */
export const enclosingLoop = (node: ESTree.Node): Option.Option<Loop> => {
  let child = node;
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) return callbackLoop(ancestor);
    const loop = Option.filter(statementLoop(ancestor), () => isLoopBody(ancestor, child));
    if (Option.isSome(loop)) return loop;
    child = ancestor;
  }
  return Option.none();
};

/** Whether `child` is the body of the loop statement `loop` (its test and head run once or per step). */
const isLoopBody = (loop: ESTree.Node, child: ESTree.Node): boolean =>
  "body" in loop && loop.body === child;
