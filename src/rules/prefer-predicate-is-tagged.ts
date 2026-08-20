/** Prefer reusable Effect predicates for combined tagged-value narrowing. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  effectCallbackLocation,
  hasOneTaggedSubject,
  tagComparisonsInOr,
} from "./_tagged-control-flow.js";

const isCatchIfPredicate = (node: ESTree.LogicalExpression): boolean => {
  const location = effectCallbackLocation(node, "catchIf");
  if (location === null) return false;
  let predicateIndex = 1;
  if (location.argumentCount === 2) predicateIndex = 0;
  return location.index === predicateIndex;
};

export const preferPredicateIsTagged = Rule.define({
  name: "prefer-predicate-is-tagged",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Predicate.isTagged for combined tagged-value narrowing.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      LogicalExpression: (node: ESTree.LogicalExpression) => {
        if (node.operator !== "||") return Effect.void;
        if (node.parent?.type === "LogicalExpression" && node.parent.operator === "||") {
          return Effect.void;
        }
        if (isCatchIfPredicate(node)) return Effect.void;
        const comparisons = tagComparisonsInOr(node);
        if (comparisons === null || !hasOneTaggedSubject(comparisons)) return Effect.void;
        return context.report(
          Diagnostic.make({
            node,
            message:
              "Use a named Predicate refinement composed from Predicate.isTagged for multiple tags.",
          }),
        );
      },
    };
  },
});
