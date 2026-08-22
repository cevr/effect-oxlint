/** Require stable operation names for Effect.fn. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const isFunction = (node: ESTree.CallExpression["arguments"][number] | undefined): boolean =>
  node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";

export const requireNamedEffectFn = Rule.define({
  name: "require-named-effect-fn",
  meta: Rule.meta({
    type: "suggestion",
    description: "Require a stable operation name for Effect.fn.",
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
        const isOperation = isStaticMember(node.callee, namespaces, "fn");
        if (!isOperation || !isFunction(node.arguments[0])) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              'Name this operation with Effect.fn("Domain.operation") for stable tracing and diagnostics.',
          }),
        );
      },
    };
  },
});
