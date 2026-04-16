/**
 * Ban Match.when/orElse branches that contain multi-step Effect sequencing.
 *
 * Select the value in Match, then run one Effect pipeline outside.
 *
 * Source: biome-effect-linting-rules/no-match-effect-branch
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const sequencingMethods = new Set(["flatMap", "map", "andThen", "tap", "zipRight", "pipe"])

const containsEffectSequencing = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] === "CallExpression" && "callee" in n) {
    const callee = n["callee"] as Record<string, unknown> | null
    if (callee != null && callee["type"] === "MemberExpression") {
      const obj = callee["object"] as Record<string, unknown> | null
      const prop = callee["property"] as Record<string, unknown> | null
      if (
        obj != null && obj["type"] === "Identifier" && obj["name"] === "Effect" &&
        prop != null && prop["type"] === "Identifier" && typeof prop["name"] === "string" &&
        sequencingMethods.has(prop["name"])
      ) {
        return true
      }
    }
    if ("arguments" in n && Array.isArray(n["arguments"])) {
      for (const arg of n["arguments"]) {
        if (containsEffectSequencing(arg)) return true
      }
    }
  }
  if ("body" in n) {
    if (Array.isArray(n["body"])) {
      for (const child of n["body"]) {
        if (containsEffectSequencing(child)) return true
      }
    } else if (containsEffectSequencing(n["body"])) return true
  }
  if ("argument" in n && containsEffectSequencing(n["argument"])) return true
  if ("expression" in n && containsEffectSequencing(n["expression"])) return true
  return false
}

export const noMatchEffectBranch = Rule.define({
  name: "no-match-effect-branch",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect sequencing inside Match branches. Select value in Match, run Effect outside.",
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

        // Check the callback argument for Effect sequencing
        const callbackIdx = isMatchWhen ? 1 : 0
        const callback = node.arguments[callbackIdx]
        if (callback != null && containsEffectSequencing(callback)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid Effect sequencing inside Match branches. Select value in Match, then run one Effect pipeline outside.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
