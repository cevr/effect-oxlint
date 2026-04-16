/**
 * Ban `Effect.succeed("...")` with string literal arguments.
 *
 * Return domain values (Option/Either/tagged unions) instead.
 *
 * Source: biome-effect-linting-rules/no-string-sentinel-return
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noEffectSucceedString = Rule.define({
  name: "no-effect-succeed-string",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.succeed with string literals. Return domain values (tagged unions, Option, Either).",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "succeed")) return Effect.void

        if (
          "arguments" in node &&
          Array.isArray(node.arguments) &&
          node.arguments.length === 1
        ) {
          const arg = node.arguments[0]
          if (
            arg != null &&
            typeof arg === "object" &&
            "type" in arg &&
            arg.type === "Literal" &&
            "value" in arg &&
            typeof arg.value === "string"
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid Effect.succeed with string literals. Use tagged unions, Option, or Either.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})
