/** Construct acquireRelease resources inside the acquire Effect, not before it. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { expressionArgument } from "./_call-arguments.js";
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
  if (node === ancestor) return true;
  for (const current of ancestors(node)) {
    if (current === ancestor) return true;
  }
  return false;
};

const isThunk = (node: ESTree.Expression): node is Thunk =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** The value a thunk returns, when its body is an expression or holds exactly one return. */
const singleReturnedValue = (thunk: Thunk): Option.Option<ESTree.Expression> => {
  const body = thunk.body;
  if (Predicate.isNull(body)) return Option.none();
  if (body.type !== "BlockStatement") return Option.some(body);
  const returns = body.body.filter(
    (statement): statement is ESTree.ReturnStatement => statement.type === "ReturnStatement",
  );
  if (returns.length !== 1) return Option.none();
  return Option.flatMap(Arr.head(returns), (returned) => Option.fromNullOr(returned.argument));
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
        onSome: (variable) =>
          Option.match(Arr.head(variable.defs), {
            onNone: () => true,
            onSome: (definition) => isCapturedDefinition(definition.node, value.name, thunk, seen),
          }),
      });
    };

    /** Whether a binding's definition holds a value that exists before the thunk runs. */
    const isCapturedDefinition = (
      definition: ESTree.Node,
      name: string,
      thunk: Thunk,
      seen: Set<ESTree.Node>,
    ): boolean => {
      if (seen.has(definition)) return false;
      seen.add(definition);
      if (!isWithin(definition, thunk)) return true;
      if (definition.type === "VariableDeclarator") {
        const init = definition.init;
        return Predicate.isNotNull(init) && isCaptured(init, thunk, seen);
      }
      return Option.exists(
        Arr.findFirst(
          thunk.params,
          (parameter): parameter is ESTree.AssignmentPattern =>
            parameter.type === "AssignmentPattern" &&
            parameter.left.type === "Identifier" &&
            parameter.left.name === name,
        ),
        (defaulted) => isCaptured(defaulted.right, thunk, seen),
      );
    };

    const returnsCapturedHandle = (
      expression: ESTree.Expression,
      effects: ReadonlySet<string>,
    ): boolean => {
      if (!isStaticCall(expression, effects, "sync")) return false;
      const thunk = Option.filter(
        Option.map(expressionArgument(expression, 0), unwrapExpression),
        isThunk,
      );
      return Option.exists(thunk, (lazy) =>
        Option.exists(singleReturnedValue(lazy), (returned) =>
          isCaptured(returned, lazy, new Set()),
        ),
      );
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
        const eagerAcquire = Option.filter(expressionArgument(node, 0), (acquire) => {
          const expression = unwrapExpression(acquire);
          return (
            isStaticCall(expression, effects, "succeed") ||
            returnsCapturedHandle(expression, effects)
          );
        });
        return Option.match(eagerAcquire, {
          onNone: () => Effect.void,
          onSome: (acquire) =>
            ctx.report(
              Diagnostic.make({
                node: acquire,
                message:
                  "Build the resource inside acquire (Effect.sync(() => new Resource()), Effect.tryPromise, or another lazy Effect). Effect.succeed(handle) or Effect.sync(() => handle) creates it before acquire runs, so an interruption in between leaks it.",
              }),
            ),
        });
      },
    };
  },
});
