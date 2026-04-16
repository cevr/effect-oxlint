/**
 * Ban directly-nested `Effect.gen` calls that can be flattened.
 *
 * Fires only when an inner `Effect.gen` is `yield*`'d straight into the outer
 * gen body — the inner gen can be inlined (its statements hoisted into the
 * outer gen).
 *
 * Flagged:
 *   Effect.gen(function*() { yield* Effect.gen(function*() { ... }) })
 *
 * Allowed — wrapped in another operator (not directly yielded):
 *   Effect.gen(function*() {
 *     yield* Effect.scoped(Effect.gen(function*() { ... }))
 *     yield* Effect.forkDetach(Effect.gen(function*() { ... }))
 *   })
 *
 * Allowed — method-style (closes over outer-yielded deps):
 *   Effect.gen(function*() {
 *     const ref = yield* Ref.make(0)
 *     return { op: () => Effect.gen(function*() { yield* Ref.get(ref) }) }
 *   })
 *
 * Sources: biome-effect-linting-rules/no-nested-effect-gen, language-service/nestedEffectGenYield
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

// An inner Effect.gen is "directly nested" only if its value is yielded
// straight into the outer gen's body — i.e. the parent chain is:
//
//   CallExpression (inner Effect.gen)
//     ← YieldExpression (delegate, i.e. yield*)
//     ← ExpressionStatement
//     ← BlockStatement
//     ← FunctionExpression (outer Effect.gen/fn callback)
//
// Any other shape — wrapped in another call (`Effect.scoped(Effect.gen(...))`,
// `Effect.forkDetach(Effect.gen(...))`), returned from a method, etc. — is an
// inline gen and not an antipattern.
const parentOf = (node: ESTree.Node): ESTree.Node | undefined =>
  (node as unknown as { parent?: ESTree.Node }).parent

const isDirectlyNestedGen = (node: ESTree.Node): boolean => {
  const yieldExpr = parentOf(node)
  if (yieldExpr?.type !== "YieldExpression") return false
  // Must be `yield*` (delegate), not `yield`
  if ((yieldExpr as unknown as { delegate?: boolean }).delegate !== true) return false

  const stmt = parentOf(yieldExpr)
  if (stmt?.type !== "ExpressionStatement") return false

  const block = parentOf(stmt)
  if (block?.type !== "BlockStatement") return false

  const fn = parentOf(block)
  if (fn?.type !== "FunctionExpression" && fn?.type !== "ArrowFunctionExpression") return false

  const call = parentOf(fn)
  if (call?.type !== "CallExpression") return false
  return (
    AST.isCallOf(call as ESTree.CallExpression, "Effect", "gen") ||
    AST.isCallOf(call as ESTree.CallExpression, "Effect", "fn")
  )
}

export const noNestedEffectGen = Rule.define({
  name: "no-nested-effect-gen",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid nested Effect.gen. Flatten to a single Effect.gen per method.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const depth = yield* Ref.make(0)

    return Visitor.merge(
      Visitor.tracked("CallExpression", (node) => AST.isCallOf(node, "Effect", "gen"), depth),
      {
        CallExpression: (node) =>
          Effect.flatMap(Ref.get(depth), (d) => {
            if (d <= 1) return Effect.void
            if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "gen")) return Effect.void
            if (!isDirectlyNestedGen(node as ESTree.Node)) return Effect.void
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Nested Effect.gen detected. Flatten to a single Effect.gen.",
              }),
            )
          }),
      },
    )
  },
})
