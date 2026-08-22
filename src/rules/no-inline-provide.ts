/** Keep Effect provisioning at explicit composition boundaries. */
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isInsideEffectProgram } from "./_effect-context.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

export const noInlineProvide = Rule.define({
  name: "no-inline-provide",
  meta: Rule.meta({
    type: "problem",
    description: "Keep Effect provisioning outside domain Effect operations.",
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
        if (!isStaticMember(node.callee, namespaces, "provide")) return Effect.void;
        if (!isInsideEffectProgram(node, namespaces)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Do not provide dependencies inside an Effect operation. Provide the layer once at the application, handler, command, or test boundary.",
          }),
        );
      },
    };
  },
});
