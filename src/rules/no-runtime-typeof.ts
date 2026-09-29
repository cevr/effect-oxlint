/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

/** Whether `typeof` probes for a possibly absent binding, which only `typeof` can do safely. */
function isExistenceProbe(node: ESTree.UnaryExpression): boolean {
  const parent = node.parent;
  if (parent?.type !== "BinaryExpression") return false;
  if (!["===", "!==", "==", "!="].includes(parent.operator)) return false;
  const other = parent.left === node ? parent.right : parent.left;
  return other.type === "Literal" && other.value === "undefined";
}

/** Disallow runtime typeof checks that narrow unparsed values instead of decoding them. */
export const noRuntimeTypeof = Rule.define({
  name: "no-runtime-typeof",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
    messages: {
      runtimeTypeof:
        "A runtime `typeof` check only narrows an unparsed representation; it does not establish the expected contract. Parse the value into a strongly typed domain type at the earliest possible point, as close as possible to the I/O boundary where the data originated.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      UnaryExpression: (node: ESTree.UnaryExpression) =>
        node.operator === "typeof" && !isExistenceProbe(node)
          ? context.report(Diagnostic.fromId({ node, messageId: "runtimeTypeof" }))
          : Effect.void,
    };
  },
});
