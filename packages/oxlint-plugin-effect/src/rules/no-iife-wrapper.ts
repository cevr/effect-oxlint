/**
 * Ban immediately-invoked function expressions (IIFEs).
 *
 * Use named const binding + flat pipeline.
 *
 * Source: biome-effect-linting-rules/no-iife-wrapper
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noIifeWrapper = Rule.define({
  name: "no-iife-wrapper",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid IIFEs. Use named const bindings + flat pipeline.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!("callee" in node)) return Effect.void
        const callee = node.callee
        if (callee == null || typeof callee !== "object" || !("type" in callee)) return Effect.void

        const isWrappedFn =
          callee.type === "ArrowFunctionExpression" ||
          callee.type === "FunctionExpression"

        // Also catch (expr)(...) where expr is parenthesized fn
        const isParenWrapped =
          callee.type === "ParenthesizedExpression" &&
          "expression" in callee &&
          callee.expression != null &&
          typeof callee.expression === "object" &&
          "type" in callee.expression &&
          (callee.expression.type === "ArrowFunctionExpression" ||
            callee.expression.type === "FunctionExpression")

        if (isWrappedFn || isParenWrapped) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Avoid IIFEs. Use named const binding + flat pipeline.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
