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

// Pipeline combinators — the user normally chains with .pipe(). Required for
// the OUTER call: only these form a "call tower" when nested.
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

// Combinators that accept an Effect (not a function) as their second arg.
// For these, a bare Effect constructor as the second arg is legitimate code
// and flattenable: `Effect.andThen(x, Effect.sync(...))` → `x.pipe(Effect.andThen(Effect.sync(...)))`.
const effectAcceptingCombinators = new Set([
  "andThen",
  "tap",
  "zipRight",
  "zipLeft",
])

// Effect producers — constructors that return an Effect.
const effectProducers = new Set([
  "gen",
  "fn",
  "succeed",
  "fail",
  "failCause",
  "sync",
  "promise",
  "tryPromise",
  "try",
  "async",
  "void",
  "die",
  "dieMessage",
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

        // Only the data-first form is flaggable: `Effect.flatMap(self, fn)`,
        // `Effect.andThen(self, next)`. The data-last (pipeable) form takes a
        // single argument that IS the "inner" — and it's called inside a
        // `.pipe(...)` so there's no nesting to flatten. Require 2+ args.
        if (ce.arguments.length < 2) return Effect.void

        const outerTakesEffect = effectAcceptingCombinators.has(outerName)

        for (const arg of ce.arguments) {
          const innerName = getEffectMethodName(arg)
          if (innerName === undefined) continue

          // Call tower: outer AND inner both pipeline combinators
          // (e.g. Effect.map(x, Effect.flatMap(y, f))).
          // Producer arg: outer accepts an effect and inner is an effect
          // producer (e.g. Effect.andThen(x, Effect.sync(...))).
          const isCallTower = pipelineCombinators.has(innerName)
          const isProducerArg = outerTakesEffect && effectProducers.has(innerName)
          if (isCallTower || isProducerArg) {
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
