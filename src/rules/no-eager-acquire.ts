/** Construct acquireRelease resources inside the acquire Effect, not before it. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticCall, visibleNamespaces } from "./_effect-namespaces.js";

type Thunk = ESTree.ArrowFunctionExpression | ESTree.Function;

const unwrapExpression = (node: ESTree.Expression): ESTree.Expression => {
  let current = node;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = current.expression;
  }
  return current;
};

const isWithin = (node: ESTree.Node, ancestor: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node;
  while (current !== null) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
};

const singleReturnedValue = (thunk: Thunk): ESTree.Expression | undefined => {
  const body = thunk.body;
  if (body === null) return undefined;
  if (body.type !== "BlockStatement") return body;
  const returns = body.body.filter(
    (statement): statement is ESTree.ReturnStatement => statement.type === "ReturnStatement",
  );
  const [returned] = returns;
  if (returns.length !== 1 || returned === undefined) return undefined;
  return returned.argument ?? undefined;
};

export const noEagerAcquire = Rule.define({
  name: "no-eager-acquire",
  meta: Rule.meta({
    type: "problem",
    description:
      "Construct a resource inside the Effect.acquireRelease acquire Effect, not before it.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    /** Whether the value was bound outside the thunk, so it exists before acquire runs. */
    const isCaptured = (
      expression: ESTree.Expression,
      thunk: Thunk,
      seen: Set<ESTree.Node>,
    ): boolean => {
      const value = unwrapExpression(expression);
      if (value.type === "ThisExpression") return true;
      if (value.type === "MemberExpression") {
        return value.object.type !== "Super" && isCaptured(value.object, thunk, seen);
      }
      if (value.type !== "Identifier") return false;
      return Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(value), value.name), {
        onNone: () => true,
        onSome: (variable) => {
          const [definition] = variable.defs;
          if (definition === undefined) return true;
          if (seen.has(definition.node)) return false;
          seen.add(definition.node);
          if (!isWithin(definition.node, thunk)) return true;
          if (definition.node.type === "VariableDeclarator") {
            return definition.node.init !== null && isCaptured(definition.node.init, thunk, seen);
          }
          const defaulted = thunk.params.find(
            (parameter): parameter is ESTree.AssignmentPattern =>
              parameter.type === "AssignmentPattern" &&
              parameter.left.type === "Identifier" &&
              parameter.left.name === value.name,
          );
          return defaulted !== undefined && isCaptured(defaulted.right, thunk, seen);
        },
      });
    };

    const returnsCapturedHandle = (
      expression: ESTree.Expression,
      effects: ReadonlySet<string>,
    ): boolean => {
      if (!isStaticCall(expression, effects, "sync")) return false;
      const [argument] = expression.arguments;
      if (argument === undefined || argument.type === "SpreadElement") return false;
      const thunk = unwrapExpression(argument);
      if (thunk.type !== "ArrowFunctionExpression" && thunk.type !== "FunctionExpression") {
        return false;
      }
      const returned = singleReturnedValue(thunk);
      return returned !== undefined && isCaptured(returned, thunk, new Set());
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        if (node.callee.type === "Super") return Effect.void;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        if (!isStaticCall(node, effects, "acquireRelease")) return Effect.void;
        const [acquire] = node.arguments;
        if (acquire === undefined || acquire.type === "SpreadElement") return Effect.void;
        const expression = unwrapExpression(acquire);
        if (
          !isStaticCall(expression, effects, "succeed") &&
          !returnsCapturedHandle(expression, effects)
        ) {
          return Effect.void;
        }
        return ctx.report(
          Diagnostic.make({
            node: acquire,
            message:
              "Build the resource inside acquire (Effect.sync(() => new Resource()), Effect.tryPromise, or another lazy Effect). Effect.succeed(handle) or Effect.sync(() => handle) creates it before acquire runs, so an interruption in between leaks it.",
          }),
        );
      },
    };
  },
});
