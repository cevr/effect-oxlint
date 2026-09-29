/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, SourceCode } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  arrayMethodTarget,
  isKnownArrayExpression,
  unwrapArrayExpression,
} from "./_anti-slop-array-method.js";

const pairedMethod = (name: string): Option.Option<string> => {
  if (name === "map") return Option.some("filter");
  if (name === "filter") return Option.some("map");
  return Option.none();
};

// Local change: the pair lookup returns Option instead of early null returns in the visitor.
function filterMapPair(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
): Option.Option<{ readonly first: string; readonly second: string }> {
  return Option.flatMap(arrayMethodTarget(node.callee), (outer) =>
    Option.flatMap(pairedMethod(outer.name), (pairedName) => {
      const innerCall = unwrapArrayExpression(outer.object);
      if (innerCall.type !== "CallExpression") return Option.none();
      const inner = Option.filter(
        arrayMethodTarget(innerCall.callee),
        (method) => method.name === pairedName && isKnownArrayExpression(sourceCode, method.object),
      );
      return Option.map(inner, (method) => ({ first: method.name, second: outer.name }));
    }),
  );
}

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
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(filterMapPair(context.sourceCode, node), {
          onNone: () => Effect.void,
          onSome: ({ first, second }) =>
            context.report(
              Diagnostic.fromId({ node, messageId: "arrayFilterMap", data: { first, second } }),
            ),
        }),
    };
  },
});
