/** Construct shared caches in their owning layer, not on every operation call. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { enclosingEffectProgram } from "./_effect-context.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const cachedEffectOperations = new Set(["cached", "cachedInvalidateWithTTL", "cachedWithTTL"]);
const cacheConstructors = new Set(["make", "makeWith"]);

const isOperation = (
  node: ESTree.Expression,
  namespaces: ReadonlySet<string>,
  operations: ReadonlySet<string>,
): boolean => {
  for (const operation of operations) {
    if (isStaticMember(node, namespaces, operation)) return true;
  }
  return false;
};

export const noPerCallCacheConstruction = Rule.define({
  name: "no-per-call-cache-construction",
  meta: Rule.meta({
    type: "suggestion",
    description: "Construct shared caches once in their owning layer.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const cacheNamespaces = new Set(["Cache"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Cache", "effect/Cache")) {
          cacheNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        const program = enclosingEffectProgram(node, effects);
        if (program === undefined || program[1] === "gen") return Effect.void;
        const caches = visibleNamespaces(ctx, node, cacheNamespaces);
        const constructsCache =
          isOperation(node.callee, effects, cachedEffectOperations) ||
          isOperation(node.callee, caches, cacheConstructors);
        if (!constructsCache) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Construct this cache once in its owning layer. Creating it inside an Effect operation creates new cache state on every call.",
          }),
        );
      },
    };
  },
});
