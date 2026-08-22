/** Keep ManagedRuntime construction at non-Effect host boundaries. */
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isInsideEffectProgram } from "./_effect-context.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

export const noManagedRuntimeInEffect = Rule.define({
  name: "no-managed-runtime-in-effect",
  meta: Rule.meta({
    type: "problem",
    description: "Create ManagedRuntime only at a non-Effect host boundary.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const managedRuntimeNamespaces = new Set(["ManagedRuntime"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "ManagedRuntime", "effect/ManagedRuntime")) {
          managedRuntimeNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const runtimes = visibleNamespaces(ctx, node, managedRuntimeNamespaces);
        if (!isStaticMember(node.callee, runtimes, "make")) return Effect.void;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        if (!isInsideEffectProgram(node, effects)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Create ManagedRuntime only at a non-Effect host boundary. Use the current Effect environment inside Effect programs.",
          }),
        );
      },
    };
  },
});
