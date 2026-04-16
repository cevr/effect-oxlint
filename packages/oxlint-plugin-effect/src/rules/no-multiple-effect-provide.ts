/**
 * Ban consecutive `Effect.provide()` calls — merge into one.
 *
 * Detects: `effect.pipe(Effect.provide(A), Effect.provide(B))`
 * Suggests: `effect.pipe(Effect.provide(Layer.mergeAll(A, B)))`
 *
 * This is an AST heuristic — it catches the common patterns without
 * needing the type checker to confirm they're actually Layer values.
 *
 * Source: language-service/multipleEffectProvide
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const isEffectProvide = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  return Option.isSome(AST.matchCallOf(node as ESTree.CallExpression, "Effect", "provide"))
}

const countProvides = (args: ReadonlyArray<ESTree.Node>): number => {
  let count = 0
  for (const arg of args) {
    if (isEffectProvide(arg as ESTree.Node)) count++
  }
  return count
}

export const noMultipleEffectProvide = Rule.define({
  name: "no-multiple-effect-provide",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid consecutive Effect.provide() calls. Merge into Effect.provide(Layer.mergeAll(...)).",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        const args = call.arguments
        if (args.length < 3) return Effect.void

        // Check bare pipe() or .pipe() with multiple Effect.provide args
        const calleeName = Option.getOrUndefined(AST.calleeName(call))
        const callee = call.callee

        const isPipe =
          calleeName === "pipe" ||
          (callee.type === "MemberExpression" &&
            "property" in callee &&
            (callee as unknown as Record<string, unknown>)["computed"] !== true &&
            (() => {
              const prop = (callee as unknown as Record<string, unknown>)["property"]
              return prop != null && typeof prop === "object" && "name" in prop && prop.name === "pipe"
            })())

        if (!isPipe) return Effect.void

        if (countProvides(args as ReadonlyArray<ESTree.Node>) >= 2) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Multiple Effect.provide() in pipe. Merge into Effect.provide(Layer.mergeAll(...)).",
            }),
          )
        }

        return Effect.void
      },
    }
  },
})
