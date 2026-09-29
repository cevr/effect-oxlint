/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import { isGlobalReflectMethodCall } from "./_anti-slop-reflect-method.js";

/** Ban Reflect.apply, which bypasses ordinary typed function calls. */
export const noReflectApply = Rule.define({
  name: "no-reflect-apply",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface.",
    messages: {
      reflectApply:
        "Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      // Local change: the report condition is an early return instead of a ternary.
      CallExpression: (node: ESTree.CallExpression) => {
        if (
          node.callee.type === "Super" ||
          !isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")
        ) {
          return Effect.void;
        }
        return context.report(Diagnostic.fromId({ node, messageId: "reflectApply" }));
      },
    };
  },
});
