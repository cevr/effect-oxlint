/** Require finite concurrency for collections that can grow. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const unboundedConcurrency = (
  node: ESTree.CallExpression["arguments"][number] | undefined,
): ESTree.Node | undefined => {
  if (node?.type !== "ObjectExpression") return undefined;
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const isConcurrency =
      (property.key.type === "Identifier" && property.key.name === "concurrency") ||
      (property.key.type === "Literal" && property.key.value === "concurrency");
    if (!isConcurrency) continue;
    if (property.value.type === "Literal" && property.value.value === "unbounded") {
      return property.value;
    }
  }
  return undefined;
};

const fixedCollection = (node: ESTree.CallExpression["arguments"][number] | undefined): boolean =>
  node?.type === "ArrayExpression" || node?.type === "ObjectExpression";

export const noUnboundedConcurrency = Rule.define({
  name: "no-unbounded-concurrency",
  meta: Rule.meta({
    type: "problem",
    description: "Require finite concurrency for Effect operations over collections that can grow.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        let optionsIndex: number | undefined;
        if (isStaticMember(node.callee, namespaces, "all")) optionsIndex = 1;
        if (isStaticMember(node.callee, namespaces, "forEach")) optionsIndex = 2;
        if (optionsIndex === undefined || fixedCollection(node.arguments[0])) return Effect.void;
        const unbounded = unboundedConcurrency(node.arguments[optionsIndex]);
        if (unbounded === undefined) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node: unbounded,
            message:
              "Bound concurrency for a collection that can grow. Use a finite concurrency value.",
          }),
        );
      },
    };
  },
});
