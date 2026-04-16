/**
 * Ban nested IIFE chains — `((x) => ((y) => ...)(arg2))(arg1)`.
 *
 * Use named const bindings + flat pipeline.
 *
 * Source: biome-effect-linting-rules/no-arrow-ladder
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isIife = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as unknown as Record<string, unknown>
  if (n["type"] !== "CallExpression") return false
  const callee = n["callee"]
  if (callee == null || typeof callee !== "object") return false
  const c = callee as unknown as Record<string, unknown>
  return c["type"] === "ArrowFunctionExpression" || c["type"] === "FunctionExpression"
}

const containsIife = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as unknown as Record<string, unknown>
  if (isIife(n)) return true
  if ("body" in n) {
    if (Array.isArray(n["body"])) {
      for (const child of n["body"]) {
        if (containsIife(child)) return true
      }
    } else if (containsIife(n["body"])) return true
  }
  if ("argument" in n && containsIife(n["argument"])) return true
  if ("arguments" in n && Array.isArray(n["arguments"])) {
    for (const arg of n["arguments"]) {
      if (containsIife(arg)) return true
    }
  }
  if ("expression" in n && containsIife(n["expression"])) return true
  return false
}

export const noArrowLadder = Rule.define({
  name: "no-arrow-ladder",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid nested IIFE chains. Use named const bindings + flat pipeline.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!isIife(node)) return Effect.void

        // Check if the body of the IIFE itself contains another IIFE
        const callee = (node as unknown as Record<string, unknown>)["callee"]
        if (callee == null || typeof callee !== "object") return Effect.void
        const c = callee as unknown as Record<string, unknown>
        if ("body" in c && containsIife(c["body"])) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Nested IIFE chain detected. Use named const bindings + flat pipeline.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})
