/**
 * Ban nested Effect.* calls — `Effect.outer(Effect.inner(...))`.
 *
 * Build values first, then one flat pipeline.
 *
 * Sources: biome-effect-linting-rules/no-nested-effect-call, no-effect-call-in-effect-arg, no-call-tower, no-effect-ladder
 */
import type { ESTree } from "@oxlint/plugins"
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isEffectCall = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] !== "CallExpression") return false
  const callee = n["callee"]
  if (callee == null || typeof callee !== "object") return false
  const c = callee as Record<string, unknown>
  if (c["type"] !== "MemberExpression") return false
  const obj = c["object"]
  if (obj == null || typeof obj !== "object") return false
  const o = obj as Record<string, unknown>
  return o["type"] === "Identifier" && o["name"] === "Effect"
}

export const noNestedEffectCall = Rule.define({
  name: "no-nested-effect-call",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid nesting Effect.* calls. Build values first, then use a flat pipeline.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!isEffectCall(node)) return Effect.void

        const ce = node as ESTree.CallExpression
        if (!("arguments" in ce) || !Array.isArray(ce.arguments)) return Effect.void

        for (const arg of ce.arguments) {
          if (isEffectCall(arg)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Nested Effect.* call detected. Build values first, then use a flat pipeline.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})
