/**
 * An event is a past-tense business fact, not a field change.
 *
 * Reported (a hint): an `@alchemy.run/domain` event whose tag ends in
 * `Updated`, `Set`, `Changed` or `Modified` (`Domain.Event("PostUpdated", …)`).
 * Such a name records that data moved, not what happened, so views and
 * policies cannot tell a retitle from a correction. Name the fact
 * (`PostRetitled`, `PriceCorrected`). Source: alchemy-domain `modeling.md`
 * "`AccountUpdated` is a smell", "An event named after a field change
 * (`BalanceSet`)" (catalog SR-D04).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { walk } from "./_anti-slop-effect.js";
import { buildingBlockOf, domainImports } from "./_domain.js";

const fieldChange = /(?:Updated|Set|Changed|Modified)$/u;

export const eventNameIsAFact = Rule.define({
  name: "event-name-is-a-fact",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Name a domain event after the business fact (PostRetitled), not a field change (PostUpdated, BalanceSet).",
    docs: { recommended: false, preset: "skills-domain" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const namesIn = (program: ESTree.Program) => {
      const imports = domainImports(program);
      if (imports.namespaces.size === 0 && imports.named.size === 0) return [];
      const found: Array<{ readonly node: ESTree.Node; readonly tag: string }> = [];
      walk(program, (node) => {
        if (node.type !== "CallExpression") return true;
        if (!Option.contains(buildingBlockOf(imports, node), "Event")) return true;
        const first = node.arguments[0];
        if (
          first?.type === "Literal" &&
          Predicate.isString(first.value) &&
          fieldChange.test(first.value)
        ) {
          found.push({ node: first, tag: first.value });
        }
        return true;
      });
      return found;
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          namesIn(program),
          ({ node, tag }) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${tag}\` names a field change, not what happened, so views and policies cannot tell one reason for the change from another. Name the business fact the command recorded (\`PostRetitled\`, \`PriceCorrected\`, \`AccountFrozen\`), one event per reason.`,
              }),
            ),
          { discard: true },
        ),
    };
  },
});
