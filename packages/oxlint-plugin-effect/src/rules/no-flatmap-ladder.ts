/**
 * Ban nested `Effect.flatMap` calls (flatMap ladder).
 *
 * Build context once with `Effect.all`/`Effect.map` and run a single flatMap.
 *
 * Source: biome-effect-linting-rules/no-flatmap-ladder
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isEffectFlatMap = (node: ESTree.CallExpression): boolean =>
  AST.isCallOf(node, "Effect", "flatMap")

const containsEffectFlatMap = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] === "CallExpression" && "callee" in n && "arguments" in n) {
    if (isEffectFlatMap(node as ESTree.CallExpression)) return true
  }
  if ("arguments" in n && Array.isArray(n["arguments"])) {
    for (const arg of n["arguments"]) {
      if (containsEffectFlatMap(arg)) return true
    }
  }
  if ("body" in n) return containsEffectFlatMap(n["body"])
  return false
}

export const noFlatmapLadder = Rule.define({
  name: "no-flatmap-ladder",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid nested Effect.flatMap (flatMap ladder). Build context once with Effect.all and run a single flatMap.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const ce = node as ESTree.CallExpression
        if (!isEffectFlatMap(ce)) return Effect.void
        if (!("arguments" in ce) || !Array.isArray(ce.arguments)) return Effect.void

        // Check if any argument's subtree contains another Effect.flatMap
        for (const arg of ce.arguments) {
          if (arg != null && typeof arg === "object" && "type" in arg) {
            if (arg.type === "CallExpression" && isEffectFlatMap(arg as ESTree.CallExpression)) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Nested Effect.flatMap detected. Build context with Effect.all, then single flatMap.",
                }),
              )
            }
            // Check inside arrow/function body
            if (
              (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") &&
              "body" in arg &&
              containsEffectFlatMap(arg.body)
            ) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Nested Effect.flatMap detected. Build context with Effect.all, then single flatMap.",
                }),
              )
            }
          }
        }
        return Effect.void
      },
    }
  },
})
