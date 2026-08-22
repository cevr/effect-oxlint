/** Flatten directly yielded Effect.gen programs. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isInsideEffectProgram } from "./_effect-context.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const isDirectYield = (node: ESTree.CallExpression): boolean =>
  node.parent?.type === "YieldExpression";

export const noNestedEffectGen = Rule.define({
  name: "no-nested-effect-gen",
  meta: Rule.meta({
    type: "suggestion",
    description: "Flatten directly yielded nested Effect.gen programs.",
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
        if (!isStaticMember(node.callee, namespaces, "gen") || !isDirectYield(node)) {
          return Effect.void;
        }
        if (!isInsideEffectProgram(node, namespaces)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: "Flatten this directly yielded Effect.gen into the owning Effect operation.",
          }),
        );
      },
    };
  },
});
