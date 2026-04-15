/**
 * Ban `Effect.succeed(someVariable)` where the argument is a plain identifier.
 *
 * Suggests selecting a plain value (Option/Match), then running one Effect pipeline.
 *
 * Source: biome-effect-linting-rules/no-effect-succeed-variable
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noEffectSucceedVariable = Rule.define({
  name: "no-effect-succeed-variable",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.succeed with a plain variable. Select value with Option/Match, then run one Effect pipeline.",
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
            arg.type === "Identifier"
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid Effect.succeed(variable). Select value with Option/Match, then run one Effect pipeline.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})
