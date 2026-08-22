/** Require Service.of for inline Layer implementations. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  importedNamespaces,
  isStaticCall,
  isStaticMember,
  visibleNamespaces,
} from "./_effect-namespaces.js";

const returnedObject = (
  node: ESTree.CallExpression["arguments"][number] | undefined,
): ESTree.ObjectExpression | undefined => {
  if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") {
    return undefined;
  }
  if (node.body === null) return undefined;
  if (node.body.type === "ObjectExpression") return node.body;
  if (node.body.type !== "BlockStatement") return undefined;
  for (const statement of node.body.body) {
    if (statement.type === "ReturnStatement" && statement.argument?.type === "ObjectExpression") {
      return statement.argument;
    }
  }
  return undefined;
};

const implementationObject = (
  node: ESTree.CallExpression,
  layerNamespaces: ReadonlySet<string>,
  effectNamespaces: ReadonlySet<string>,
): ESTree.ObjectExpression | undefined => {
  if (node.callee.type === "Super" || node.arguments.length < 2) return undefined;
  const implementation = node.arguments[1];
  if (implementation === undefined || implementation.type === "SpreadElement") return undefined;

  if (isStaticMember(node.callee, layerNamespaces, "succeed")) {
    if (implementation.type === "ObjectExpression") return implementation;
    return undefined;
  }
  if (isStaticMember(node.callee, layerNamespaces, "sync")) {
    return returnedObject(implementation);
  }
  if (!isStaticMember(node.callee, layerNamespaces, "effect")) return undefined;
  if (implementation.type !== "CallExpression" || implementation.callee.type === "Super") {
    return undefined;
  }
  if (isStaticMember(implementation.callee, effectNamespaces, "succeed")) {
    const value = implementation.arguments[0];
    if (value?.type === "ObjectExpression") return value;
    return undefined;
  }
  if (isStaticCall(implementation, effectNamespaces, "gen")) {
    return returnedObject(implementation.arguments[0]);
  }
  return undefined;
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
        if (implementation === undefined) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node: implementation,
            message: `Wrap this implementation with ${service.name}.of(...) so it stays checked against the service interface.`,
          }),
        );
      },
    };
  },
});
