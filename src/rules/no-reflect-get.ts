/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import { isGlobalReflectMethodCall } from "./_anti-slop-reflect-method.js";

/** Ban Reflect.get, which bypasses ordinary property access and useful type evidence. */
export const noReflectGet = Rule.define({
  name: "no-reflect-get",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow Reflect.get; use typed property access or parse dynamic input into a domain type.",
    messages: {
      reflectGet:
        "Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        node.callee.type !== "Super" &&
        isGlobalReflectMethodCall(context.sourceCode, node.callee, "get")
          ? context.report(Diagnostic.fromId({ node, messageId: "reflectGet" }))
          : Effect.void,
    };
  },
});
