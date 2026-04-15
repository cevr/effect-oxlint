/**
 * Ban `Effect.succeed(undefined)` and `Effect.succeed(void 0)`.
 *
 * Use `Effect.void` instead.
 *
 * Source: language-service/effectSucceedWithVoid
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isUndefinedLike = (node: unknown): boolean => {
  if (node == null || typeof node !== "object" || !("type" in node)) return false
  // undefined identifier
  if (node.type === "Identifier" && "name" in node && node.name === "undefined") return true
  // void 0
  if (
    node.type === "UnaryExpression" &&
    "operator" in node &&
    node.operator === "void" &&
    "argument" in node &&
    node.argument != null &&
    typeof node.argument === "object" &&
    "type" in node.argument &&
    node.argument.type === "Literal" &&
    "value" in node.argument &&
    node.argument.value === 0
  )
    return true
  return false
}

export const noEffectSucceedVoid = Rule.define({
  name: "no-effect-succeed-void",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.succeed(undefined). Use Effect.void instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "succeed")) return Effect.void

        if (
          "arguments" in node &&
          Array.isArray(node.arguments) &&
          node.arguments.length === 1 &&
          isUndefinedLike(node.arguments[0])
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Use Effect.void instead of Effect.succeed(undefined).",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
