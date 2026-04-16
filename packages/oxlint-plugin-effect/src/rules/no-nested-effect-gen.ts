/**
 * Ban nested `Effect.gen` calls that can be flattened.
 *
 * Fires when one `Effect.gen` body directly contains another `Effect.gen` —
 * the inner gen can be yielded as a plain effect and flattened away.
 *
 * Does NOT fire for method-style gens: an `Effect.gen` that is the body of
 * a function/arrow returned from the outer gen (service factory, object
 * literal method). Those close over yielded deps and can't be flattened.
 *
 * Example (flagged):
 *   Effect.gen(function*() { yield* Effect.gen(function*() { ... }) })
 *
 * Example (allowed — method-style):
 *   const make = Effect.gen(function*() {
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

// Walk up the parent chain from an inner Effect.gen call. If we pass through
// a function/arrow that is NOT the direct argument of an Effect.gen / Effect.fn
// call, the inner gen is a method-style body (closes over outer-yielded deps)
// — don't flag. If we reach an enclosing Effect.gen generator body without
// hitting such a function, the inner gen is directly nested — flag.
const isMethodStyleGen = (node: ESTree.Node): boolean => {
  let cur: ESTree.Node | null | undefined = (node as unknown as { parent?: ESTree.Node }).parent
  while (cur != null) {
    if (cur.type === "FunctionExpression" || cur.type === "ArrowFunctionExpression") {
      // Is this function the callback of an Effect.gen / Effect.fn call?
      const parent = (cur as unknown as { parent?: ESTree.Node }).parent
      if (
        parent != null &&
        parent.type === "CallExpression" &&
        (AST.isCallOf(parent as ESTree.CallExpression, "Effect", "gen") ||
          AST.isCallOf(parent as ESTree.CallExpression, "Effect", "fn"))
      ) {
        // Reached the enclosing Effect.gen/fn body — truly nested
        return false
      }
      // Intervening callback (object method, event handler, .on(...) arg, etc.)
      return true
    }
    cur = (cur as unknown as { parent?: ESTree.Node }).parent
  }
  return false
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
            if (isMethodStyleGen(node as ESTree.Node)) return Effect.void
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
