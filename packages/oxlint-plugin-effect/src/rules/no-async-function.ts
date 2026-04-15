/**
 * Ban `async` functions.
 *
 * Use Effect.promise, Effect.tryPromise, or Effect.gen instead.
 *
 * Source: language-service/asyncFunction
 *
 * Note: This is an effectNative rule — off by default.
 * Only enable in codebases fully committed to Effect.
 */
import { Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noAsyncFunction = Rule.define({
  name: "no-async-function",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid async functions. Use Effect.promise or Effect.tryPromise.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const report = (node: Parameters<typeof Diagnostic.make>[0]["node"]) =>
      ctx.report(
        Diagnostic.make({
          node,
          message:
            "Avoid async functions. Use Effect.promise, Effect.tryPromise, or Effect.gen.",
        }),
      )

    return {
      FunctionDeclaration: (node) => {
        if ("async" in node && node.async === true) return report(node)
        return Effect.void
      },
      FunctionExpression: (node) => {
        if ("async" in node && node.async === true) return report(node)
        return Effect.void
      },
      ArrowFunctionExpression: (node) => {
        if ("async" in node && node.async === true) return report(node)
        return Effect.void
      },
    }
  },
})
