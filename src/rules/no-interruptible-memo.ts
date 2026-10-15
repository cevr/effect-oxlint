/**
 * A run that must start once is a started fiber, not an `Effect.cached*`.
 *
 * What `Effect.cached`, `cachedWithTTL` and `cachedInvalidateWithTTL` do
 * with a run whose caller leaves depends on the effect release:
 *
 * - effect 4.0.0 runs it in its first caller's fiber and keeps the exit that
 *   fiber reaches, so once that caller is interrupted every later caller gets
 *   the interruption back. An `uninterruptible` input does not protect the
 *   settlement, and a function TTL does not prove the interruption no
 *   lifetime.
 * - From effect 4.0.1 the run is a fiber of its own. A run that every caller
 *   has left is interrupted and never cached, and the next caller starts a
 *   new one. A run an interruption cannot stop (a promise with no signal, an
 *   engine's start) goes on beside the new run.
 *
 * So no release starts the run once. Fork it once into a scope that owns it,
 * and `Fiber.join` it in each caller. The rule is opt-in: on 4.0.1 and later
 * a run that is safe to start again (an interruptible read) may keep its
 * `Effect.cached`.
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
      "Memoize a started fiber when a run must start once: Effect.cached keeps its first caller's interruption (effect 4.0.0) or starts a run its callers left again (4.0.1 on).",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const report = (node: ESTree.Node, name: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Effect.${name} gives up a run its callers leave: on effect 4.0.0 the run is its first caller's, and that caller's interruption is kept for every later caller; from 4.0.1 a run that every caller has left is interrupted, and the next caller starts a new one, while a run an interruption cannot stop (a promise with no signal, an engine's start) goes on beside it. When the run must start once, fork it once into a scope that owns it and Fiber.join it in each caller.`,
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
