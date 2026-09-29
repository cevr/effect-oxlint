/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  arrayMethodTarget,
  isKnownArrayExpression,
  resolveArrayBinding,
  unwrapArrayExpression,
} from "./_anti-slop-array-method.js";

const arrayCopyMethods = new Set([
  "concat",
  "slice",
  "toSpliced",
  "toSorted",
  "toReversed",
  "with",
]);

interface Reducer {
  readonly callback: ESTree.ArrowFunctionExpression | ESTree.Function;
  readonly accumulator: ESTree.BindingIdentifier;
  readonly initialValue: ESTree.Argument | undefined;
}

function reducerForCallback(
  callback: ESTree.ArrowFunctionExpression | ESTree.Function,
): Reducer | null {
  let owner: ESTree.Node | null = callback.parent;
  while (owner !== null && unwrapArrayExpression(owner) === callback) owner = owner.parent;
  if (owner?.type !== "CallExpression") return null;
  const method = arrayMethodTarget(owner.callee);
  const firstArgument = owner.arguments[0];
  if (
    method === null ||
    (method.name !== "reduce" && method.name !== "reduceRight") ||
    owner.arguments.length > 2 ||
    firstArgument === undefined ||
    unwrapArrayExpression(firstArgument) !== callback
  ) {
    return null;
  }
  const firstParameter = callback.params[0];
  const accumulator =
    firstParameter?.type === "AssignmentPattern" ? firstParameter.left : firstParameter;
  if (accumulator?.type !== "Identifier") return null;
  return { callback, accumulator, initialValue: owner.arguments[1] };
}

function enclosingReducer(node: ESTree.Node): Reducer | null {
  let parent = node.parent;
  while (parent !== null) {
    if (parent.type === "FunctionDeclaration") return null;
    // Local change: the nearest callback is checked in reducerForCallback to keep this loop small.
    if (parent.type === "ArrowFunctionExpression" || parent.type === "FunctionExpression") {
      return reducerForCallback(parent);
    }
    parent = parent.parent;
  }
  return null;
}

function referencesAccumulator(
  sourceCode: SourceCode,
  node: ESTree.Node,
  accumulator: Variable,
  visited = new Set<Variable>(),
): boolean {
  const variable = resolveArrayBinding(sourceCode, node);
  if (variable === null || visited.has(variable)) return false;
  if (variable === accumulator) return true;
  visited.add(variable);
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return false;
  }
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      definition.node.init !== null &&
      definition.node.parent.type === "VariableDeclaration" &&
      definition.node.parent.kind === "const"
    ) {
      return referencesAccumulator(sourceCode, definition.node.init, accumulator, visited);
    }
  }
  return false;
}

function isGlobalCopyOwner(sourceCode: SourceCode, node: ESTree.Node, name: string): boolean {
  const owner = unwrapArrayExpression(node);
  if (owner.type !== "Identifier" || owner.name !== name) return false;
  const variable = resolveArrayBinding(sourceCode, owner);
  return variable === null || variable.defs.length === 0;
}

/** Reject non-spread copies of reducer accumulators; pair with oxc/no-accumulating-spread. */
export const noReduceAccumulatorCopy = Rule.define({
  name: "no-reduce-accumulator-copy",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow copying growing reducer accumulators with Object.assign, Array.from, or array copy methods.",
    messages: {
      accumulatorCopy:
        "Do not copy the reducer accumulator on every iteration; growing copies can cause quadratic work. Mutate a fresh, locally owned accumulator and return it, or use an iterator pipeline/flatMap.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    const { sourceCode } = context;

    const copiesAccumulator = (node: ESTree.CallExpression): boolean => {
      const method = arrayMethodTarget(node.callee);
      if (method === null) return false;
      const reducer = enclosingReducer(node);
      if (reducer === null) return false;
      const accumulator = sourceCode
        .getDeclaredVariables(reducer.callback)
        .find((variable) =>
          variable.identifiers.some((identifier) => identifier.start === reducer.accumulator.start),
        );
      if (accumulator === undefined) return false;
      const isAccumulator = (expression: ESTree.Node) =>
        referencesAccumulator(sourceCode, expression, accumulator);
      if (method.name === "assign" && isGlobalCopyOwner(sourceCode, method.object, "Object")) {
        const target = node.arguments[0];
        return (
          target !== undefined &&
          unwrapArrayExpression(target).type === "ObjectExpression" &&
          node.arguments.slice(1).some(isAccumulator)
        );
      }
      if (method.name === "from" && isGlobalCopyOwner(sourceCode, method.object, "Array")) {
        const source = node.arguments[0];
        return source !== undefined && isAccumulator(source);
      }
      if (!arrayCopyMethods.has(method.name)) return false;
      const initialValue = reducer.initialValue;
      return (
        initialValue !== undefined &&
        isKnownArrayExpression(sourceCode, initialValue) &&
        isAccumulator(method.object)
      );
    };

    return {
      CallExpression: (node: ESTree.CallExpression) =>
        copiesAccumulator(node)
          ? context.report(Diagnostic.fromId({ node, messageId: "accumulatorCopy" }))
          : Effect.void,
    };
  },
});
