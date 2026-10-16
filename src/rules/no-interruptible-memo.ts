/**
 * A run that must start once is a started fiber, not an `Effect.cached*`.
 *
 * What `Effect.cached`, `cachedWithTTL` and `cachedInvalidateWithTTL` do
 * with a run whose caller leaves depends on the effect release:
 *
 * - effect 4.0.0 runs it in its first caller's fiber and keeps the exit that
 *   fiber reaches, so once that caller is interrupted later callers get the
 *   interruption back while the entry lives: for `cached`, from then on; for
 *   `cachedWithTTL` and `cachedInvalidateWithTTL`, until the time to live
 *   given for that exit ends or the entry is invalidated. An
 *   `uninterruptible` input does not protect the settlement.
 * - From effect 4.0.1 the run is a fiber of its own. A run that every caller
 *   has left is interrupted and never cached, and the next caller starts a
 *   new one. A run an interruption cannot stop (a promise with no signal, an
 *   engine's start) goes on beside the new run.
 *
 * So on 4.0.0 a caller's interruption reaches the callers after it, and from
 * 4.0.1 a run its callers left starts again. When the run must start once
 * and finish, fork it once into a scope that owns it, and `Fiber.join` it in
 * each caller. The rule is opt-in: on 4.0.1 and later a run that is safe to
 * start again (an interruptible read) may keep its `Effect.cached`.
 *
 * `Effect` is effect's when imported from `effect` (under any alias) or from
 * `effect/Effect` whole, or when the file binds the name nowhere; a
 * namespace of another module named `Effect` is not.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { staticMemberName } from "./_global-values.js";
import { nameBindings } from "./_name-bindings.js";

/** How long 4.0.0 gives a later caller the kept interruption back, by memoizer. */
const keptFor = {
  cached: "later callers get that caller's interruption back",
  cachedWithTTL:
    "later callers get that caller's interruption back while the entry lives, until the time to live given for that exit ends",
  cachedInvalidateWithTTL:
    "later callers get that caller's interruption back while the entry lives, until the time to live given for that exit ends or it is invalidated",
} as const satisfies Record<string, string>;

type Memoizer = keyof typeof keptFor;

const isMemoizer = (name: string): name is Memoizer => Object.hasOwn(keptFor, name);

export const noInterruptibleMemo = Rule.define({
  name: "no-interruptible-memo",
  meta: Rule.meta({
    type: "problem",
    description:
      "Memoize a started fiber when a run must start once: Effect.cached gives its first caller's interruption to later callers (effect 4.0.0) or starts a run its callers left again (4.0.1 on).",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);
    /** Whether a name is effect's `Effect`: imported from `effect` or `effect/Effect` whole, or bound nowhere. */
    const isEffect = (node: ESTree.Node) =>
      bindings.importsAs(node, (from) => from === "effect", "Effect") ||
      bindings.importsAs(node, (from) => from === "effect/Effect", "*") ||
      bindings.isGlobal(node, "Effect");
    const report = (node: ESTree.Node, name: Memoizer) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Effect.${name} gives up a run its callers leave: on effect 4.0.0 the run is its first caller's, and ${keptFor[name]}; from 4.0.1 a run that every caller has left is interrupted, and the next caller starts a new one, while a run an interruption cannot stop (a promise with no signal, an engine's start) goes on beside it. When the run must start once, fork it once into a scope that owns it and Fiber.join it in each caller.`,
        }),
      );

    return {
      MemberExpression: (node: ESTree.MemberExpression) => {
        if (!isEffect(node.object)) return Effect.void;
        return Option.match(Option.filter(staticMemberName(node), isMemoizer), {
          onNone: () => Effect.void,
          onSome: (name) => report(node, name),
        });
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
          if (isMemoizer(name)) return report(node, name);
        }
        return Effect.void;
      },
    };
  },
});
