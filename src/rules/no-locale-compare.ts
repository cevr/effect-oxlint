/**
 * Ban ordering strings by the process locale.
 *
 * `localeCompare` and `Intl.Collator` order by the locale and ICU data of the
 * process that runs them, so the same input sorts differently on another
 * machine, runtime or release. Output that must be stable (prompt bytes,
 * listings, snapshots) never wants that; `Order.String` orders by UTF-16 code
 * unit everywhere.
 *
 * The rule reports every `localeCompare` member read on any receiver
 * (`a.localeCompare(b)`, `a["localeCompare"]`), and `Intl.Collator` called
 * or constructed through any spelling of the global (`new Intl.Collator()`,
 * `Intl.Collator()`, `globalThis.Intl.Collator`, an alias of `Intl`).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { globalValueVisitor, staticMemberName, type Held } from "./_global-values.js";

const collator: Held = "Intl.Collator";

const message = (used: string) =>
  `Avoid ${used}: ordering by the process locale is not deterministic. Use Order.String (UTF-16 code-unit order).`;

export const noLocaleCompare = Rule.define({
  name: "no-locale-compare",
  meta: Rule.meta({
    type: "problem",
    description:
      "Order strings with Order.String, not localeCompare or Intl.Collator, which follow the process locale.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const report = (node: ESTree.Node, used: string) =>
      ctx.report(Diagnostic.make({ node, message: message(used) }));
    /** A call or `new` of what the walk holds: only the collator is a use. */
    const reportCollator = (node: ESTree.Node, held: Held, used: string): Effect.Effect<void> => {
      if (held !== collator) return Effect.void;
      return report(node, used);
    };

    const intl = globalValueVisitor(ctx, {
      names: new Set(["Intl"]),
      memberValue: (owner, name) =>
        Option.liftPredicate(collator, () => owner === "Intl" && name === "Collator"),
      member: () => Effect.void,
      call: (node, held) => reportCollator(node, held, "Intl.Collator()"),
      construct: (node, held) => reportCollator(node, held, "new Intl.Collator()"),
      rest: (_node, _held, follow) => follow,
      escape: () => Effect.void,
    });

    return {
      ...intl,
      MemberExpression: (node) =>
        Option.match(
          Option.filter(AST.narrow(node, "MemberExpression"), (member) =>
            Option.exists(staticMemberName(member), (name) => name === "localeCompare"),
          ),
          {
            onNone: () => Effect.void,
            onSome: (member) => report(member, "localeCompare"),
          },
        ),
    };
  },
});
