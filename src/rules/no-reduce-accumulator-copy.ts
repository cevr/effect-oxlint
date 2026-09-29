/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ancestors } from "./_ast-ancestors.js";
import {
  arrayMethodTarget,
  constInitializer,
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
  // Local change: an absent initial value is Option instead of undefined.
  readonly initialValue: Option.Option<ESTree.Argument>;
}

type Callback = ESTree.ArrowFunctionExpression | ESTree.Function;

const isCallback = (node: ESTree.Node): node is Callback =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const parameterBinding = (
  parameter: ESTree.ParamPattern,
): ESTree.ParamPattern | ESTree.BindingPattern => {
  if (parameter.type === "AssignmentPattern") return parameter.left;
  return parameter;
};

const isReduceCall = (owner: ESTree.CallExpression, callback: Callback): boolean =>
  Option.exists(
    arrayMethodTarget(owner.callee),
    (method) => method.name === "reduce" || method.name === "reduceRight",
  ) &&
  owner.arguments.length <= 2 &&
  Option.exists(
    Arr.head(owner.arguments),
    (firstArgument) => unwrapArrayExpression(firstArgument) === callback,
  );

// Local change: returns Option instead of null, and walks ancestors instead of a parent loop.
function reducerForCallback(callback: Callback): Option.Option<Reducer> {
  const owner = Arr.findFirst(
    ancestors(callback),
    (node) => unwrapArrayExpression(node) !== callback,
  );
  return Option.flatMap(owner, (call) => {
    if (call.type !== "CallExpression" || !isReduceCall(call, callback)) return Option.none();
    return Option.flatMap(Arr.head(callback.params), (firstParameter) => {
      const accumulator = parameterBinding(firstParameter);
      if (accumulator.type !== "Identifier") return Option.none();
      return Option.some({ callback, accumulator, initialValue: Arr.get(call.arguments, 1) });
    });
  });
}

// Local change: returns Option instead of null; the nearest callback is checked in reducerForCallback.
function enclosingReducer(node: ESTree.Node): Option.Option<Reducer> {
  const boundary = Arr.findFirst(
    ancestors(node),
    (parent) => parent.type === "FunctionDeclaration" || isCallback(parent),
  );
  return Option.flatMap(boundary, (parent) => {
    if (!isCallback(parent)) return Option.none();
    return reducerForCallback(parent);
  });
}

// Local change: binding and initializer lookups compose Option instead of null checks.
function referencesAccumulator(
  sourceCode: SourceCode,
  node: ESTree.Node,
  accumulator: Variable,
  visited = new Set<Variable>(),
): boolean {
  return Option.exists(resolveArrayBinding(sourceCode, node), (variable) => {
    if (visited.has(variable)) return false;
    if (variable === accumulator) return true;
    visited.add(variable);
    if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
      return false;
    }
    return Option.exists(constInitializer(variable), (init) =>
      referencesAccumulator(sourceCode, init, accumulator, visited),
    );
  });
}

// Local change: an unresolved binding is Option.none instead of null.
function isGlobalCopyOwner(sourceCode: SourceCode, node: ESTree.Node, name: string): boolean {
  const owner = unwrapArrayExpression(node);
  if (owner.type !== "Identifier" || owner.name !== name) return false;
  return Option.match(resolveArrayBinding(sourceCode, owner), {
    onNone: () => true,
    onSome: (variable) => variable.defs.length === 0,
  });
}

interface AccumulatorCopy {
  readonly method: { readonly name: string; readonly object: ESTree.Node };
  readonly reducer: Reducer;
  readonly accumulator: Variable;
}

// Local change: the method, reducer, and accumulator lookups are gathered as one Option.
function accumulatorCopyCandidate(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
): Option.Option<AccumulatorCopy> {
  const lookups = Option.all({
    method: arrayMethodTarget(node.callee),
    reducer: enclosingReducer(node),
  });
  return Option.flatMap(lookups, ({ method, reducer }) => {
    const accumulator = Arr.findFirst(
      sourceCode.getDeclaredVariables(reducer.callback),
      (variable) =>
        variable.identifiers.some((identifier) => identifier.start === reducer.accumulator.start),
    );
    return Option.map(accumulator, (variable) => ({ method, reducer, accumulator: variable }));
  });
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

    const copiesAccumulator = (
      node: ESTree.CallExpression,
      { method, reducer, accumulator }: AccumulatorCopy,
    ): boolean => {
      const isAccumulator = (expression: ESTree.Node) =>
        referencesAccumulator(sourceCode, expression, accumulator);
      if (method.name === "assign" && isGlobalCopyOwner(sourceCode, method.object, "Object")) {
        return (
          Option.exists(
            Arr.head(node.arguments),
            (target) => unwrapArrayExpression(target).type === "ObjectExpression",
          ) && node.arguments.slice(1).some(isAccumulator)
        );
      }
      if (method.name === "from" && isGlobalCopyOwner(sourceCode, method.object, "Array")) {
        return Option.exists(Arr.head(node.arguments), isAccumulator);
      }
      if (!arrayCopyMethods.has(method.name)) return false;
      return (
        Option.exists(reducer.initialValue, (initialValue) =>
          isKnownArrayExpression(sourceCode, initialValue),
        ) && isAccumulator(method.object)
      );
    };

    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const copies = Option.exists(accumulatorCopyCandidate(sourceCode, node), (candidate) =>
          copiesAccumulator(node, candidate),
        );
        if (!copies) return Effect.void;
        return context.report(Diagnostic.fromId({ node, messageId: "accumulatorCopy" }));
      },
    };
  },
});
