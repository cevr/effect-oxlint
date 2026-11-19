/**
 * A promise mirrored into state by hand, for noPromiseMirroredState (React)
 * and noPromiseMirroredSignal (Solid): a loading flag set around an `await`,
 * and a setter called from a promise's result.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { isFunction, walk } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";
import { calleeIdentifier } from "./_react.js";

/** The nodes of a function's body, outside nested functions. */
const ownNodes = (fn: FunctionNode): ReadonlyArray<ESTree.Node> => {
  const nodes: Array<ESTree.Node> = [];
  const body = fn.body ?? fn;
  walk(body, (node) => {
    if (node !== body && isFunction(node)) return false;
    nodes.push(node);
    return true;
  });
  return nodes;
};

/** A call of a setter in `setters` with the literal `value`. */
const setterCallWith = (
  node: ESTree.Node,
  setters: ReadonlySet<string>,
  value: boolean,
): Option.Option<string> => {
  if (node.type !== "CallExpression") return Option.none();
  const argument = node.arguments[0];
  if (argument?.type !== "Literal" || argument.value !== value) return Option.none();
  return Option.filter(calleeIdentifier(node), (name) => setters.has(name));
};

/** A loading flag in `fn`: `set(true)`, a later `await`, and `set(false)`. */
export const loadingFlag = (
  fn: FunctionNode,
  setters: ReadonlySet<string>,
): Option.Option<readonly [ESTree.Node, string]> => {
  const nodes = ownNodes(fn);
  const awaits = nodes.filter((node) => node.type === "AwaitExpression");
  return Arr.findFirst(nodes, (node) =>
    Option.flatMap(setterCallWith(node, setters, true), (setter) => {
      const awaitsAfter = awaits.some((wait) => wait.start > node.start);
      const reset = nodes.some((other) =>
        Option.contains(setterCallWith(other, new Set([setter]), false), setter),
      );
      if (!awaitsAfter || !reset) return Option.none();
      return Option.some([node, setter] as const);
    }),
  );
};

const isSetterCall = (node: ESTree.Node, setters: ReadonlySet<string>): boolean =>
  node.type === "CallExpression" &&
  Option.exists(calleeIdentifier(node), (name) => setters.has(name));

/** Whether a callback body sets state from a promise's result: in a `.then(…)`, or after an `await`. */
export const setsFromPromise = (body: ESTree.Node, setters: ReadonlySet<string>): boolean => {
  let found = false;
  walk(body, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      !node.callee.computed &&
      node.callee.property.type === "Identifier" &&
      node.callee.property.name === "then"
    ) {
      found ||= node.arguments.some(
        (argument) =>
          isFunction(argument) && ownNodes(argument).some((n) => isSetterCall(n, setters)),
      );
    }
    if (isFunction(node) && node.async) {
      const nodes = ownNodes(node);
      found ||= nodes.some(
        (wait) =>
          wait.type === "AwaitExpression" &&
          nodes.some((n) => isSetterCall(n, setters) && n.start > wait.start),
      );
    }
    return !found;
  });
  return found;
};
