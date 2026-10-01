/**
 * Effect.cached* keeps the first caller's exit, including interruption.
 * Protecting only the input with uninterruptible does not protect settlement:
 * its caller's pending interruption can arrive before the memo stores the exit.
 * A function-shaped TTL does not prove that interruption gets zero lifetime.
 * Use a started fiber owned by a scope, or Cache's independent lookup fiber.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, visibleNamespaces } from "./_effect-namespaces.js";
import { staticMemberName } from "./_global-values.js";

const memoizers = ["cached", "cachedWithTTL", "cachedInvalidateWithTTL"];

export const noInterruptibleMemo = Rule.define({
  name: "no-interruptible-memo",
  meta: Rule.meta({
    type: "problem",
    description:
      "Memoize a started fiber or use Cache: Effect.cached keeps its first caller's interruption for every later caller.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const report = (node: ESTree.Node, name: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Effect.${name} keeps the exit of its first caller, an interruption included: once that caller is interrupted, every later caller gets the interruption back. Memoize a started fiber (fork it once into an owning scope, then Fiber.join in each caller), or use Cache, which runs each lookup in a fiber of its own.`,
        }),
      );

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      MemberExpression: (node: ESTree.MemberExpression) => {
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        if (node.object.type !== "Identifier" || !effects.has(node.object.name)) return Effect.void;
        return Option.match(
          Option.filter(staticMemberName(node), (name) => memoizers.includes(name)),
          {
            onNone: () => Effect.void,
            onSome: (name) => report(node, name),
          },
        );
      },
      Identifier: (node: ESTree.IdentifierReference) => {
        if (node.parent.type === "ImportSpecifier") return Effect.void;
        const variable = Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name);
        if (Option.isNone(variable)) return Effect.void;
        if (!variable.value.references.some((reference) => reference.identifier === node))
          return Effect.void;
        for (const definition of variable.value.defs) {
          const specifier = definition.node;
          if (definition.type !== "ImportBinding" || specifier.type !== "ImportSpecifier") continue;
          const declaration = specifier.parent;
          if (
            declaration.type !== "ImportDeclaration" ||
            declaration.source.value !== "effect/Effect"
          )
            continue;
          const imported = specifier.imported;
          let name = "";
          if (imported.type === "Identifier") name = imported.name;
          else name = imported.value;
          if (memoizers.includes(name)) return report(node, name);
        }
        return Effect.void;
      },
    };
  },
});
