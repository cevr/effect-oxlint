/**
 * Ban nested Effect pipeline calls — `Effect.flatMap(Effect.map(...))`.
 *
 * The "call tower" antipattern: Effect pipeline combinators nested directly
 * inside each other instead of composed through `.pipe(...)`.
 *
 * Only fires when BOTH outer and inner are pipeline combinators. Standard
 * combinators that canonically take an Effect argument (`ensuring`,
 * `scoped`, `fork`, `either`, etc.) are not flagged.
 *
 * Sources: biome-effect-linting-rules/no-nested-effect-call, no-call-tower, no-effect-ladder
 */
import type { ESTree } from "@oxlint/plugins"
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

// Pipeline combinators — ones the user normally chains with .pipe(),
// and which as a result are the antipattern targets when nested directly.
const pipelineCombinators = new Set([
  "flatMap",
  "map",
  "mapBoth",
  "mapError",
  "andThen",
  "tap",
  "tapError",
  "tapBoth",
  "zipRight",
  "zipLeft",
  "zip",
  "as",
  "asVoid",
  "catchAll",
  "catchAllCause",
  "catch",
  "catchCause",
  "catchTag",
  "catchTags",
])

const getEffectMethodName = (node: unknown): string | undefined => {
  if (node == null || typeof node !== "object") return undefined
  const n = node as Record<string, unknown>
  if (n["type"] !== "CallExpression") return undefined
  const callee = n["callee"]
  if (callee == null || typeof callee !== "object") return undefined
  const c = callee as Record<string, unknown>
  if (c["type"] !== "MemberExpression") return undefined
  const obj = c["object"]
  const prop = c["property"]
  if (obj == null || typeof obj !== "object") return undefined
  if (prop == null || typeof prop !== "object") return undefined
  const o = obj as Record<string, unknown>
  const p = prop as Record<string, unknown>
  if (o["type"] !== "Identifier" || o["name"] !== "Effect") return undefined
  if (p["type"] !== "Identifier" || typeof p["name"] !== "string") return undefined
  return p["name"]
}

export const noNestedEffectCall = Rule.define({
  name: "no-nested-effect-call",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid nested Effect pipeline calls. Compose with .pipe() instead of nesting.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const outerName = getEffectMethodName(node)
        if (outerName === undefined || !pipelineCombinators.has(outerName)) {
          return Effect.void
        }

        const ce = node as ESTree.CallExpression
        if (!("arguments" in ce) || !Array.isArray(ce.arguments)) return Effect.void

        for (const arg of ce.arguments) {
          const innerName = getEffectMethodName(arg)
          if (innerName !== undefined && pipelineCombinators.has(innerName)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: `Nested Effect.${outerName}(Effect.${innerName}(...)). Use .pipe(Effect.${innerName}(...), Effect.${outerName}(...)) instead.`,
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})
