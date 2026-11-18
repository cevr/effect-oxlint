/**
 * Keep Effect provisioning at explicit composition boundaries.
 *
 * Reported: an `Effect.provide` inside an Effect operation; and, outside test
 * modules, a second `Effect.provide` right after another in one pipe
 * (`program.pipe(Effect.provide(A), Effect.provide(B))`), which builds and
 * provides two layers where one merged layer, provided once, was meant
 * (the effect skill, "one Layer, provided once"; alchemy-domain, "Never chain
 * `Effect.provide`"; catalog SR-E04).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isInsideEffectProgram } from "./_effect-context.js";
import { isTestModule } from "./_test-files.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** Whether `node` calls `pipe`: `x.pipe(…)` or `pipe(x, …)`. */
const isPipeCall = (node: ESTree.CallExpression): boolean => {
  if (node.callee.type === "Identifier") return node.callee.name === "pipe";
  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "pipe"
  );
};

export const noInlineProvide = Rule.define({
  name: "no-inline-provide",
  meta: Rule.meta({
    type: "problem",
    description: "Keep Effect provisioning outside domain Effect operations, provided once.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const testModule = isTestModule(ctx);

    const isProvide = (node: ESTree.Node, namespaces: ReadonlySet<string>): boolean =>
      node.type === "CallExpression" &&
      node.callee.type !== "Super" &&
      isStaticMember(node.callee, namespaces, "provide");

    /** The second of two adjacent `Effect.provide` steps of a pipe, outside Effect operations. */
    const chainedProvides = (node: ESTree.CallExpression): ReadonlyArray<ESTree.Node> => {
      if (testModule || !isPipeCall(node)) return [];
      const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
      return node.arguments.filter(
        (argument, index) =>
          index > 0 &&
          isProvide(argument, namespaces) &&
          isProvide(node.arguments[index - 1] ?? argument, namespaces) &&
          !isInsideEffectProgram(argument, namespaces),
      );
    };

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
        const chained = Effect.forEach(
          chainedProvides(node),
          (provide) =>
            ctx.report(
              Diagnostic.make({
                node: provide,
                message:
                  "A second `Effect.provide` right after another builds and provides two layers where one was meant, and hides which service each one feeds. Merge them into one layer drawn from its inputs and outputs (`Layer.provide(Live, Deps)` or `Layer.mergeAll(A, B)`) and provide it once, at the root.",
              }),
            ),
          { discard: true },
        );
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        if (!isStaticMember(node.callee, namespaces, "provide")) return chained;
        if (!isInsideEffectProgram(node, namespaces)) return chained;
        return Effect.andThen(
          chained,
          ctx.report(
            Diagnostic.make({
              node,
              message:
                "Do not provide dependencies inside an Effect operation. Provide the layer once at the application, handler, command, or test boundary.",
            }),
          ),
        );
      },
    };
  },
});
