/**
 * Ban `Match.when(true/false, () => Effect.void)` and `Match.orElse(() => Effect.void)`.
 *
 * Remove the no-op branch or restructure.
 *
 * Source: biome-effect-linting-rules/no-match-void-branch
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isEffectVoid = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] !== "MemberExpression") return false
  const obj = n["object"] as Record<string, unknown> | null
  const prop = n["property"] as Record<string, unknown> | null
  return (
    obj != null && obj["type"] === "Identifier" && obj["name"] === "Effect" &&
    prop != null && prop["type"] === "Identifier" && prop["name"] === "void"
  )
}

const isVoidCallback = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] !== "ArrowFunctionExpression" && n["type"] !== "FunctionExpression") return false
  if (!("body" in n)) return false
  return isEffectVoid(n["body"])
}

export const noMatchVoidBranch = Rule.define({
  name: "no-match-void-branch",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid no-op Match branches returning Effect.void. Remove the branch or restructure.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const ce = node as ESTree.CallExpression
        const isMatchWhen = AST.isCallOf(ce, "Match", "when")
        const isMatchOrElse = AST.isCallOf(ce, "Match", "orElse")

        if (!isMatchWhen && !isMatchOrElse) return Effect.void

        if (!("arguments" in node) || !Array.isArray(node.arguments)) return Effect.void

        if (isMatchOrElse && node.arguments.length >= 1 && isVoidCallback(node.arguments[0])) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Match.orElse returning Effect.void is a no-op. Remove the branch or restructure.",
            }),
          )
        }

        if (isMatchWhen && node.arguments.length >= 2 && isVoidCallback(node.arguments[1])) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Match.when branch returning Effect.void is a no-op. Remove the branch or restructure.",
            }),
          )
        }

        return Effect.void
      },
    }
  },
})
