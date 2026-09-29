/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  arrayMethodTarget,
  isKnownArrayExpression,
  unwrapArrayExpression,
} from "./_anti-slop-array-method.js";

/** Reject eager array filter/map pipelines; lazy iterator helpers remain allowed. */
export const noArrayFilterMap = Rule.define({
  name: "no-array-filter-map",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Disallow adjacent array filter/map passes in favor of lazy iterator helpers or a single transformation.",
    messages: {
      arrayFilterMap:
        "Avoid consecutive array `{{first}}` and `{{second}}` passes. Prefer `.values().{{first}}(...).{{second}}(...).toArray()` where iterator helpers are supported, or a single `flatMap`/mutating reducer. Preserve callback ordering, indexes, and filtering semantics.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const outer = arrayMethodTarget(node.callee);
        if (outer === null || (outer.name !== "map" && outer.name !== "filter")) {
          return Effect.void;
        }
        const innerCall = unwrapArrayExpression(outer.object);
        if (innerCall.type !== "CallExpression") return Effect.void;
        const inner = arrayMethodTarget(innerCall.callee);
        const pairedName = outer.name === "map" ? "filter" : "map";
        if (inner === null || inner.name !== pairedName) return Effect.void;
        if (!isKnownArrayExpression(context.sourceCode, inner.object)) return Effect.void;
        return context.report(
          Diagnostic.fromId({
            node,
            messageId: "arrayFilterMap",
            data: { first: inner.name, second: outer.name },
          }),
        );
      },
    };
  },
});
