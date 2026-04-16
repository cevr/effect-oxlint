/**
 * Ban `Effect.orElse` wrapping chains with sequencing combinators.
 *
 * Move error handling to a single terminal decision after the pipeline.
 *
 * Source: biome-effect-linting-rules/no-effect-orElse-ladder
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const sequencingCombinators = ["flatMap", "zipRight", "as", "tap", "andThen"]

const containsSequencing = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] === "CallExpression" && "callee" in n) {
    const callee = n["callee"] as Record<string, unknown> | null
    if (
      callee != null &&
      callee["type"] === "MemberExpression" &&
      "object" in callee &&
      "property" in callee
    ) {
      const obj = callee["object"] as Record<string, unknown> | null
      const prop = callee["property"] as Record<string, unknown> | null
      if (
        obj != null &&
        obj["type"] === "Identifier" &&
        obj["name"] === "Effect" &&
        prop != null &&
        prop["type"] === "Identifier" &&
        typeof prop["name"] === "string" &&
        sequencingCombinators.includes(prop["name"])
      ) {
        return true
      }
    }
    if ("arguments" in n && Array.isArray(n["arguments"])) {
      for (const arg of n["arguments"]) {
        if (containsSequencing(arg)) return true
      }
    }
  }
  if ("body" in n) return containsSequencing(n["body"])
  return false
}

export const noEffectOrElseLadder = Rule.define({
  name: "no-effect-orElse-ladder",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.orElse wrapping sequencing chains. Handle errors at a single terminal decision.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "orElse")) return Effect.void

        if ("arguments" in node && Array.isArray(node.arguments)) {
          for (const arg of node.arguments) {
            if (containsSequencing(arg)) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Effect.orElse wrapping sequencing chain. Move error handling to a terminal decision after the pipeline.",
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
