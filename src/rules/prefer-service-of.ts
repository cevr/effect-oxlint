/** Require Service.of for inline Layer implementations. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument } from "./_call-arguments.js";
import {
  importedNamespaces,
  isStaticCall,
  isStaticMember,
  visibleNamespaces,
} from "./_effect-namespaces.js";

const isObjectExpression = (node: ESTree.Argument): node is ESTree.ObjectExpression =>
  node.type === "ObjectExpression";

const returnedObjectStatement = (
  statement: ESTree.Statement,
): Option.Option<ESTree.ObjectExpression> => {
  if (statement.type !== "ReturnStatement" || statement.argument?.type !== "ObjectExpression") {
    return Option.none();
  }
  return Option.some(statement.argument);
};

/** The object a function argument returns: its expression body or its first returned object. */
const returnedObject = (node: ESTree.Argument): Option.Option<ESTree.ObjectExpression> => {
  if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
    return Option.none();
  }
  const body = node.body;
  if (Predicate.isNull(body)) return Option.none();
  if (body.type === "ObjectExpression") return Option.some(body);
  if (body.type !== "BlockStatement") return Option.none();
  return Arr.findFirst(body.body, returnedObjectStatement);
};

/** The object an `Effect.succeed(...)` or `Effect.gen(...)` implementation produces. */
const effectImplementationObject = (
  implementation: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.ObjectExpression> => {
  if (implementation.type !== "CallExpression" || implementation.callee.type === "Super") {
    return Option.none();
  }
  if (isStaticMember(implementation.callee, effectNamespaces, "succeed")) {
    return Option.filter(Arr.head(implementation.arguments), isObjectExpression);
  }
  if (isStaticCall(implementation, effectNamespaces, "gen")) {
    return Option.flatMap(Arr.head(implementation.arguments), returnedObject);
  }
  return Option.none();
};

const layerImplementationObject = (
  callee: ESTree.Expression,
  implementation: ESTree.Expression,
  layerNamespaces: ReadonlySet<string>,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.ObjectExpression> => {
  if (isStaticMember(callee, layerNamespaces, "succeed")) {
    return Option.liftPredicate(implementation, isObjectExpression);
  }
  if (isStaticMember(callee, layerNamespaces, "sync")) return returnedObject(implementation);
  if (!isStaticMember(callee, layerNamespaces, "effect")) return Option.none();
  return effectImplementationObject(implementation, effectNamespaces);
};

const implementationObject = (
  node: ESTree.CallExpression,
  layerNamespaces: ReadonlySet<string>,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.ObjectExpression> => {
  const callee = node.callee;
  if (callee.type === "Super") return Option.none();
  return Option.flatMap(expressionArgument(node, 1), (implementation) =>
    layerImplementationObject(callee, implementation, layerNamespaces, effectNamespaces),
  );
};

export const preferServiceOf = Rule.define({
  name: "prefer-service-of",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use Service.of to check inline Layer implementations against the service interface.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const layerNamespaces = new Set(["Layer"]);
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Layer", "effect/Layer")) {
          layerNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        const service = node.arguments[0];
        if (service?.type !== "Identifier") return Effect.void;
        const implementation = implementationObject(
          node,
          visibleNamespaces(ctx, node, layerNamespaces),
          visibleNamespaces(ctx, node, effectNamespaces),
        );
        return Option.match(implementation, {
          onNone: () => Effect.void,
          onSome: (object) =>
            ctx.report(
              Diagnostic.make({
                node: object,
                message: `Wrap this implementation with ${service.name}.of(...) so it stays checked against the service interface.`,
              }),
            ),
        });
      },
    };
  },
});
