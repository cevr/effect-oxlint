/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

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
        node.operator === "typeof"
          ? context.report(Diagnostic.fromId({ node, messageId: "runtimeTypeof" }))
          : Effect.void,
    };
  },
});
