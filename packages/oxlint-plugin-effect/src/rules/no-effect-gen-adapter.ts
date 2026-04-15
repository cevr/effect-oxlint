/**
 * Ban deprecated adapter parameter in `Effect.gen(function*(adapter) {...})`.
 *
 * The adapter parameter is deprecated — just use `yield*` directly.
 *
 * Source: language-service/effectGenUsesAdapter
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noEffectGenAdapter = Rule.define({
  name: "no-effect-gen-adapter",
  meta: Rule.meta({
    type: "suggestion",
    description: "Deprecated adapter parameter in Effect.gen. Use `yield*` directly.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "gen")) return Effect.void

        if (!("arguments" in node) || !Array.isArray(node.arguments) || node.arguments.length < 1)
          return Effect.void

        const arg = node.arguments[0]
        if (
          arg != null &&
          typeof arg === "object" &&
          "type" in arg &&
          arg.type === "FunctionExpression" &&
          "generator" in arg &&
          arg.generator === true &&
          "params" in arg &&
          Array.isArray(arg.params) &&
          arg.params.length > 0
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Deprecated adapter parameter in Effect.gen. Remove the parameter and use `yield*` directly.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
