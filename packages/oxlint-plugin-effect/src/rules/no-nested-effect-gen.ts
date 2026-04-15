/**
 * Ban nested `Effect.gen` calls.
 *
 * An `Effect.gen` inside another `Effect.gen` should be flattened.
 *
 * Sources: biome-effect-linting-rules/no-nested-effect-gen, language-service/nestedEffectGenYield
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

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
            if (d > 1 && AST.isCallOf(node as ESTree.CallExpression, "Effect", "gen")) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Nested Effect.gen detected. Flatten to a single Effect.gen.",
                }),
              )
            }
            return Effect.void
          }),
      },
    )
  },
})
