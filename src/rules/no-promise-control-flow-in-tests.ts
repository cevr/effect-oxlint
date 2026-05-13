/**
 * Ban Promise-shaped control flow in test files.
 *
 * Effect tests should keep setup, cleanup, and assertions in Effect scopes so
 * finalizers compose with the test runtime.
 */
import type { ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import type { EffectVisitor } from "../vendor/effect-oxlint/Visitor.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const isTestFilename = (filename: string): boolean =>
  /\.test\.tsx?$/.test(filename) || /\/tests\/.*\.[cm]?tsx?$/.test(filename);

const promiseChainMethods = new Set(["then", "catch", "finally"]);
const promiseStaticMethods = new Set(["all", "allSettled", "any", "race", "resolve", "reject"]);

const isAsyncFunction = (node: ESTree.Node): boolean => "async" in node && node.async === true;

const promiseChainMethodName = (node: ESTree.CallExpression): string | undefined => {
  if (node.callee.type !== "MemberExpression") return undefined;
  const names = Option.getOrUndefined(AST.memberNames(node.callee));
  if (names === undefined) return undefined;
  const [object, property] = names;
  if (object === "Effect") return undefined;
  return promiseChainMethods.has(property) ? property : undefined;
};

export const noPromiseControlFlowInTests = Rule.define({
  name: "no-promise-control-flow-in-tests",
  meta: Rule.meta({
    type: "problem",
    description:
      "Keep test control flow in Effect instead of async/await, try/finally, or Promise chains.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestFilename(ctx.filename)) return {} as EffectVisitor;

    return {
      TryStatement: (node: ESTree.Node) => {
        if (!("finalizer" in node) || node.finalizer == null) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: "Do not use `try/finally` cleanup in tests. Use Effect scopes.",
          }),
        );
      },
      FunctionDeclaration: (node: ESTree.Node) =>
        isAsyncFunction(node)
          ? ctx.report(
              Diagnostic.make({
                node,
                message: "Do not use async test functions. Return an Effect from the test body.",
              }),
            )
          : Effect.void,
      FunctionExpression: (node: ESTree.Node) =>
        isAsyncFunction(node)
          ? ctx.report(
              Diagnostic.make({
                node,
                message: "Do not use async test functions. Return an Effect from the test body.",
              }),
            )
          : Effect.void,
      ArrowFunctionExpression: (node: ESTree.Node) =>
        isAsyncFunction(node)
          ? ctx.report(
              Diagnostic.make({
                node,
                message: "Do not use async test functions. Return an Effect from the test body.",
              }),
            )
          : Effect.void,
      AwaitExpression: (node: ESTree.Node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message: "Do not use `await` in tests. Use `yield*` inside Effect.gen.",
          }),
        ),
      NewExpression: (node: ESTree.Node) => {
        const expression = node as ESTree.NewExpression;
        if (expression.callee.type !== "Identifier" || expression.callee.name !== "Promise")
          return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Do not construct Promise directly in tests. Use Effect.async/Effect.promise at real boundaries.",
          }),
        );
      },
      CallExpression: (node: ESTree.Node) => {
        const call = node as ESTree.CallExpression;
        const chainMethod = promiseChainMethodName(call);
        if (chainMethod !== undefined) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: `Do not use Promise.${chainMethod} style chains in tests. Keep control flow in Effect.`,
            }),
          );
        }
        if (call.callee.type !== "MemberExpression") return Effect.void;
        const names = Option.getOrUndefined(AST.memberNames(call.callee));
        if (names === undefined) return Effect.void;
        const [object, property] = names;
        if (object !== "Promise" || !promiseStaticMethods.has(property)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Do not use Promise.${property} in tests. Use Effect concurrency primitives.`,
          }),
        );
      },
    };
  },
});
